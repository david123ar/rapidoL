const { MongoClient } = require("mongodb");

// MongoDB Configuration
const mongoUri =
  "mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin";
const dbName = "mydatabase";
const episodesStreamCollectionName = "episodesStream";
const animeInfoCollectionName = "animeInfo";

// Initialize MongoDB Client
const client = new MongoClient(mongoUri);

// Categories to update
const categories = ["sub", "dub", "raw"];

// Helper function to retry fetching data with a maximum of 5 attempts
async function fetchWithRetry(url, retries = 5) {
  let attempts = 0;
  while (attempts < retries) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      attempts++;
      console.error(
        `Error fetching ${url}: ${error.message}. Attempt ${attempts} of ${retries}`
      );
      if (attempts === retries) {
        throw new Error(
          `Failed to fetch data from ${url} after ${retries} attempts`
        );
      }
      // Wait for 2 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

// Function to update streaming links for all episodes and categories
async function updateStreamingLinks() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    const db = client.db(dbName);
    const episodesStreamCollection = db.collection(
      episodesStreamCollectionName
    );
    const animeInfoCollection = db.collection(animeInfoCollectionName);

    // Step 1: Fetch total pages of recently updated animes
    const initialData = await fetchWithRetry(
      "https://vimal.animoon.me/api/recently-updated?page=1"
    );

    if (!initialData.success || !initialData.results) {
      throw new Error("Failed to fetch total pages from Recently Updated API");
    }

    const totalPages = initialData.results.totalPages;
    console.log(`Total Pages: ${totalPages}`);

    // Step 2: Iterate through all pages and fetch anime info and episodes
    for (let page = 1; page <= totalPages; page++) {
      console.log(`Processing page ${page}/${totalPages}`);
      const pageData = await fetchWithRetry(
        `https://vimal.animoon.me/api/recently-updated?page=${page}`
      );

      if (!pageData.success || !pageData.results || !pageData.results.data) {
        console.error(`Error fetching data for page ${page}`);
        continue;
      }

      const animes = pageData.results.data;

      // Step 3: Process Each Anime
      for (const anime of animes) {
        const { id, title, poster, description } = anime;

        // Step 4: Fetch Anime Info and Episodes
        let infoData, episodesData;
        try {
          infoData = await fetchWithRetry(
            `https://vimal.animoon.me/api/info?id=${id}`
          );
          episodesData = await fetchWithRetry(
            `https://vimal.animoon.me/api/episodes/${id}`
          );
        } catch (error) {
          console.error(`Failed to fetch info or episodes for anime ID: ${id}`);
          continue;
        }

        const existingAnime = await animeInfoCollection.findOne({ _id: id });

        if (
          infoData.results.data.title &&
          episodesData.results.episodes[0].title
        ) {
          if (existingAnime) {
            // Update the existing anime document
            await animeInfoCollection.updateOne(
              { _id: id },
              {
                $set: {
                  info: infoData,
                  episodes: episodesData,
                },
              }
            );
            console.log("Anime document updated successfully");
          } else {
            // If the anime doesn't exist, insert a new document
            await animeInfoCollection.insertOne({
              _id: id,
              info: infoData,
              episodes: episodesData,
            });
            console.log("New anime document inserted successfully");
          }
        } else {
          console.error(
            `Skipping anime ID: ${id} due to missing title information`
          );
        }

        const episodesList = episodesData.results.episodes;

        // Step 5: Process Each Episode
        for (const episode of episodesList) {
          const { id: episodeId } = episode;

          // Check if Episode Exists in episodesStream Collection
          const existingEpisode = await episodesStreamCollection.findOne({
            _id: episodeId,
          });

          if (!existingEpisode) {
            console.log(`Fetching new episode with ID: ${episodeId}`);

            const categoryData = {};

            // Step 6: Fetch Streaming Links for All Categories
            for (const category of categories) {
              try {
                const episodeData = await fetchWithRetry(
                  `https://newgogo.animoon.me/api/data?episodeId=${encodeURIComponent(
                    episodeId
                  )}&category=${category}`
                );

                if (episodeData) {
                  categoryData[category] = episodeData || null;
                } else {
                  console.error(
                    `Failed to fetch ${category} details for episode ID: ${episodeId}`
                  );
                }
              } catch (error) {
                console.error(
                  `Error fetching ${category} for episode ID: ${episodeId}:`,
                  error.message
                );
              }
            }

            // Add New Episode to episodesStream Collection with streaming links
            await episodesStreamCollection.insertOne({
              _id: episodeId,
              title: episode.title,
              episodeId: episodeId,
              number: episode.episode_no,
              isFiller: false,
              streams: {
                raw: {
                  success: true,
                  results: { streamingLink: categoryData.raw, servers: [] },
                },
                sub: {
                  success: true,
                  results: { streamingLink: categoryData.sub, servers: [] },
                },
                dub: {
                  success: true,
                  results: { streamingLink: categoryData.dub, servers: [] },
                },
              },
              updatedAt: new Date(),
            });

            console.log(`Inserted new episode with ID: ${episodeId}`);
          } else {
            console.log(
              `Episode ID: ${episodeId} already exists in episodesStream collection`
            );
          }
        }
      }
    }

    console.log("Finished updating streaming links for all categories");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the script
updateStreamingLinks();
