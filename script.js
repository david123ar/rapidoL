const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");

// MongoDB Configuration
const mongoUri =
  "mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin";
const dbName = "mydatabase";
const episodesStreamCollectionName = "episodesStream";
const animeInfoCollectionName = "animeInfo";

// Initialize MongoDB Client
const client = new MongoClient(mongoUri);

// Helper function: Retry fetching with a maximum of 5 attempts
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
        throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait before retrying
    }
  }
}

// Main function: Update streaming links
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

      // Step 3: Process each anime
      for (const anime of animes) {
        const { id, title } = anime;

        // Step 4: Fetch Anime Info and Episodes with retry mechanism
        let infoData, episodesData;
        try {
          infoData = await fetchWithRetry(
            `https://vimal.animoon.me/api/info?id=${id}`
          );
          episodesData = await fetchWithRetry(
            `https://vimal.animoon.me/api/episodes/${id}`
          );
        } catch (error) {
          console.error(`Failed to fetch data for anime ID: ${id}. Skipping.`);
          continue;
        }

        const existingAnime = await animeInfoCollection.findOne({ _id: id });
        if (existingAnime) {
          await animeInfoCollection.updateOne(
            { _id: id },
            { $set: { info: infoData, episodes: episodesData } }
          );
          console.log(`Anime document updated successfully: ${id}`);
        } else {
          await animeInfoCollection.insertOne({
            _id: id,
            info: infoData,
            episodes: episodesData,
          });
          console.log(`New anime document inserted: ${id}`);
        }

        const episodesList = episodesData?.results?.episodes;

        // Step 5: Process each episode
        if (episodesData && episodesData?.results?.episodes?.length > 0) {
          for (const episode of episodesList) {
            const { id: episodeId, episode_no } = episode;

            // Check if episode exists in episodesStream collection
            const existingEpisode = await episodesStreamCollection.findOne({
              _id: episodeId,
            });

            if (!existingEpisode) {
              console.log(`Fetching new episode: ${episodeId}`);
              const categoryData = {};

              try {
                const rawResponse = await fetchWithRetry(
                  `https://vimal.animoon.me/api/servers/${episodeId}`
                );
                const rawData = rawResponse.results;

                for (const category of ["sub", "dub", "raw"]) {
                  if (rawData.some((item) => item.type === category)) {
                    const categoryResponse = await fetchWithRetry(
                      `https://newgogo.animoon.me/api/data?episodeId=${encodeURIComponent(
                        episodeId
                      )}&category=${category}`
                    );
                    categoryData[category] = categoryResponse;
                  }
                }

                await episodesStreamCollection.insertOne({
                  _id: episodeId,
                  title: episode.title,
                  episodeId: episodeId,
                  number: episode_no,
                  isFiller: false,
                  streams: {
                    raw: {
                      success: true,
                      results: {
                        streamingLink: categoryData.raw || [],
                        servers: [],
                      },
                    },
                    sub: {
                      success: true,
                      results: {
                        streamingLink: categoryData.sub || [],
                        servers: [],
                      },
                    },
                    dub: {
                      success: true,
                      results: {
                        streamingLink: categoryData.dub || [],
                        servers: [],
                      },
                    },
                  },
                  updatedAt: new Date(),
                });
                console.log(
                  `Episode ${episodeId} streaming links added successfully`
                );
              } catch (error) {
                console.error(
                  `Failed to fetch streaming links for episode ${episodeId}. Skipping.`
                );
              }
            }
          }
        } else {
          console.log(`No title for episode ID found ${episodeId} , Skipping...`)
        }
      }
    }
  } catch (error) {
    console.error("Error updating streaming links:", error.message);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the updater
updateStreamingLinks();
