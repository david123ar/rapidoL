const { MongoClient, ClientSession } = require("mongodb");

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
      // await new Promise((resolve) => setTimeout(resolve, 2000));
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
      "https://vimal.animoon.me/api/dubbed-anime?page=1"
    );

    if (!initialData.success || !initialData.results) {
      throw new Error("Failed to fetch total pages from Recently Updated API");
    }

    const totalPages = initialData?.results?.totalPages;
    console.log(`Total Pages: ${totalPages}`);

    // Step 2: Iterate through all pages and fetch anime info and episodes
    for (let page = 1; page <= totalPages; page++) {
      console.log(`Processing page ${page}/${totalPages}`);
      const pageData = await fetchWithRetry(
        `https://vimal.animoon.me/api/dubbed-anime?page=${page}`
      );

      if (!pageData.success || !pageData.results || !pageData.results.data) {
        console.error(`Error fetching data for page ${page}`);
        continue;
      }

      const animes = pageData.results.data;

      // Step 3: Process Each Anime
      for (const anime of animes) {
        const { id, title, poster, description } = anime;

        // Step 4: Fetch Anime Info and Episodes with retry mechanism for missing titles
        let infoData, episodesData;
        let retryCount = 0;
        while (retryCount < 5) {
          try {
            infoData = await fetchWithRetry(
              `https://vimal.animoon.me/api/info?id=${id}`
            );
            episodesData = await fetchWithRetry(
              `https://vimal.animoon.me/api/episodes/${id}`
            );
            // Check if the info title and episode title are available
            if (
              infoData.results.data.title &&
              episodesData.results.episodes[0].title
            ) {
              break; // Exit the retry loop if titles are present
            }
            throw new Error("Missing title in anime info or episode info");
          } catch (error) {
            retryCount++;
            console.error(
              `Error fetching info or episodes for anime ID: ${id}. Attempt ${retryCount}/5`
            );
            if (retryCount === 5) {
              console.error(
                `Failed to fetch data after 5 retries for anime ID: ${id}`
              );
              continue;
            }
            // await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait before retrying
          }
        }

        if (!infoData || !episodesData) {
          console.error(
            `Skipping anime ID: ${id} due to missing info or episode data`
          );
          continue;
        }

        if (
          episodesData &&
          episodesData?.results?.episodes &&
          episodesData?.results?.episodes?.length > 0 &&
          infoData?.results?.data?.title
        ) {
          const existingAnime = await animeInfoCollection.findOne({ _id: id });

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

          const episodesList = episodesData?.results?.episodes;

          {
            // Step 5: Process Each Episode
            for (const episode of episodesList) {
              const { id: episodeId, episode_no } = episode;

              // Check if Episode Exists in episodesStream Collection
              const existingEpisode = await episodesStreamCollection.findOne({
                _id: episodeId,
              });

              if (!existingEpisode) {
                console.log(`Fetching new episode with ID: ${episodeId}`);

                const categoryData = {};

                // Step 6: Check Dub before fetching streaming links
                const isRaw = await fetch(
                  `https://vimal.animoon.me/api/servers/${episodeId}`
                );
                const rawT = await isRaw.json(); //// finish it
                // If Dub exists and is greater than episode_no, skip raw

                if (rawT?.results.some((item) => item.type !== "raw")) {
                  categoryData["raw"] = []; // Skip raw category if dub is greater than episode_no
                  console.log(
                    `Skipping raw category for episode ID: ${episodeId} as dub is greater than episode_no`
                  );
                }

                // Step 7: Fetch Streaming Links for All Categories with retry for sub and dub if link is missing
                let retryCountLinks = 0;
                while (retryCountLinks < 5) {
                  try {
                    let hasValidLink = false;
                    let episodeData;

                    // If Dub is not valid or doesn't exist, we fetch raw or sub
                    if (rawT?.results.some((item) => item.type === "raw")) {
                      // Fetch sub or raw category if dub is invalid or not available
                      if (
                        !existingEpisode?.streams?.raw?.results?.streamingLink
                          ?.link?.file
                      ) {
                        episodeData = await fetchWithRetry(
                          `https://newgogo.animoon.me/api/data?episodeId=${encodeURIComponent(
                            episodeId
                          )}&category=raw`
                        );

                        if (
                          episodeData.link &&
                          episodeData.link.file &&
                          episodeData.link.file.length > 0
                        ) {
                          categoryData.raw = episodeData;
                          hasValidLink = true;
                          break;
                        }
                      } else {
                        categoryData.raw = [];
                      }

                      // If no valid link found in sub/raw, retry
                      if (
                        !hasValidLink &&
                        rawT?.results.some((item) => item.type === "raw")
                      ) {
                        retryCountLinks++;
                        console.error(
                          `Error fetching valid link for raw episode ID: ${episodeId}. Attempt ${retryCountLinks}/5`
                        );
                        if (retryCountLinks === 5) {
                          console.error(
                            `Failed to fetch valid link for raw episode ID: ${episodeId} after 5 retries`
                          );
                          break;
                        }
                        // Wait for 2 seconds before retrying
                        await new Promise((resolve) =>
                          setTimeout(resolve, 2000)
                        );
                      }
                    }
                    if (rawT?.results.some((item) => item.type === "dub")) {
                      // Fetch sub or raw category if dub is invalid or not available
                      if (
                        !existingEpisode?.streams?.dub?.results?.streamingLink
                          ?.link?.file
                      ) {
                        episodeData = await fetchWithRetry(
                          `https://newgogo.animoon.me/api/data?episodeId=${encodeURIComponent(
                            episodeId
                          )}&category=raw`
                        );

                        if (
                          episodeData.link &&
                          episodeData.link.file &&
                          episodeData.link.file.length > 0
                        ) {
                          categoryData.dub = episodeData;
                          hasValidLink = true;
                          break;
                        }
                      } else {
                        categoryData.dub = [];
                      }

                      // If no valid link found in sub/raw, retry
                      if (
                        !hasValidLink &&
                        rawT?.results.some((item) => item.type === "dub")
                      ) {
                        retryCountLinks++;
                        console.error(
                          `Error fetching valid link for dub episode ID: ${episodeId}. Attempt ${retryCountLinks}/5`
                        );
                        if (retryCountLinks === 5) {
                          console.error(
                            `Failed to fetch valid link for dub episode ID: ${episodeId} after 5 retries`
                          );
                          break;
                        }
                        // Wait for 2 seconds before retrying
                        // await new Promise((resolve) => setTimeout(resolve, 2000));
                      }
                    }
                    if (rawT?.results.some((item) => item.type === "sub")) {
                      // Fetch sub or raw category if dub is invalid or not available
                      if (
                        !existingEpisode?.streams?.sub?.results?.streamingLink
                          ?.link?.file
                      ) {
                        episodeData = await fetchWithRetry(
                          `https://newgogo.animoon.me/api/data?episodeId=${encodeURIComponent(
                            episodeId
                          )}&category=sub`
                        );

                        if (
                          episodeData.link &&
                          episodeData.link.file &&
                          episodeData.link.file.length > 0
                        ) {
                          categoryData.sub = episodeData;
                          hasValidLink = true;
                          break;
                        }
                      } else {
                        categoryData.sub = [];
                      }

                      // If no valid link found in sub/raw, retry
                      if (
                        !hasValidLink &&
                        rawT?.results.some((item) => item.type === "sub")
                      ) {
                        retryCountLinks++;
                        console.error(
                          `Error fetching valid link for sub episode ID: ${episodeId}. Attempt ${retryCountLinks}/5`
                        );
                        if (retryCountLinks === 5) {
                          console.error(
                            `Failed to fetch valid link for sub episode ID: ${episodeId} after 5 retries`
                          );
                          break;
                        }
                        // Wait for 2 seconds before retrying
                        // await new Promise((resolve) => setTimeout(resolve, 2000));
                      }
                    }
                  } catch (error) {
                    console.error(
                      `Error fetching streaming links for inserting episode ID: ${episodeId}: ${error.message}`
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

                console.log(`Inserted new episode with ID: ${episodeId}`);
              } else {
                console.log(
                  `Episode ID: ${episodeId} already exists in episodesStream collection`
                );
              }
            }
          }
        } else {
          console.log("Episodes are empty so , Skipping...");
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

// Start the update process
updateStreamingLinks();
