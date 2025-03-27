const axios = require("axios");
const { MongoClient } = require("mongodb");

// MongoDB Configuration
const mongoUri =
  "mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin";
const dbName = "mydatabase";

// Initialize MongoDB Client
const client = new MongoClient(mongoUri);

// Fetch data with retry logic
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url);
      return response;
    } catch (error) {
      console.error(`Error fetching ${url} - Attempt (${i + 1}/${retries})`);
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Fetch anime list and store data
async function fetchAnimeList() {
  await client.connect();
  const db = client.db(dbName);
  const animeCollection = db.collection("animeInfo");
  const episodesCollection = db.collection("episo");

  let currentPage = 1; // Change starting page as needed
  const response = await fetchWithRetry(
    `https://vimal.animoon.me/api/az-list?page=${currentPage}`
  );
  const totalPages = response.data.results.totalPages;

  while (currentPage <= totalPages) {
    console.log(`Processing page number: ${currentPage}`);

    try {
      const response = await fetchWithRetry(
        `https://vimal.animoon.me/api/az-list?page=${currentPage}`
      );
      const animeData = response.data.results.data;

      for (const anime of animeData) {
        const { id, title } = anime;
        console.log(
          `Processing anime: ${title} (ID: ${id}) on page ${currentPage}`
        );

        const existingAnime = await animeCollection.findOne({ _id: id });

        // Always fetch episodes even if anime exists
        const episodes = await fetchEpisodes(id, episodesCollection);

        if (!existingAnime) {
          // Fetch and store anime info only if it doesn't exist
          const animeInfo = await fetchAnimeInfo(id);
          if (animeInfo && episodes.length > 0) {
            console.log(`Storing new anime data for ${title} (ID: ${id})...`);
            await storeAnimeData(animeCollection, id, animeInfo, episodes);
          }
        } else {
          console.log(
            `Anime ${title} (ID: ${id}) already exists. Updating episodes...`
          );
          await updateAnimeEpisodes(animeCollection, id, episodes);
        }
      }
    } catch (error) {
      console.error(`Error fetching page ${currentPage}: ${error.message}`);
    }
    currentPage++;
  }

  await client.close();
}

// Fetch anime info
async function fetchAnimeInfo(id) {
  try {
    const response = await fetchWithRetry(
      `https://vimal.animoon.me/api/info?id=${id}`
    );
    return response.data.results;
  } catch (error) {
    console.error(`Error fetching info for anime ID ${id}: ${error.message}`);
    return null;
  }
}

// Fetch episodes and skip existing ones
async function fetchEpisodes(id, episodesCollection) {
  try {
    const response = await fetchWithRetry(
      `https://vimal.animoon.me/api/episodes/${id}`
    );
    const episodes = response.data.results.episodes;
    let updatedEpisodes = [];

    for (let episode of episodes) {
      const { id: episodeId } = episode;

      // Check if episode already exists
      const existingEpisode = await episodesCollection.findOne({
        _id: episodeId,
      });
      if (existingEpisode) {
        console.log(`Skipping existing episode ID: ${episodeId}`);
        updatedEpisodes.push(episodeId);
        continue;
      }

      // Fetch streaming links only for new episodes
      console.log(`Processing new episode ID: ${episodeId}...`);
      const streams = await fetchStreamLinks(episodeId);
      episode.streams = streams;

      // Store new episode data
      await storeEpisodeData(episodesCollection, episodeId, episode);
      updatedEpisodes.push(episodeId);
    }
    return updatedEpisodes;
  } catch (error) {
    console.error(
      `Error fetching episodes for anime ID ${id}: ${error.message}`
    );
    return [];
  }
}

// Fetch stream links
async function fetchStreamLinks(episodeId) {
  try {
    const rawStream = await fetchWithRetry(
      `https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-2&type=raw`
    );
    const subStream = await fetchWithRetry(
      `https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-2&type=sub`
    );
    const dubStream = await fetchWithRetry(
      `https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-2&type=dub`
    );

    return {
      raw: rawStream.data.results || null,
      sub: subStream.data.results || null,
      dub: dubStream.data.results || null,
    };
  } catch (error) {
    console.error(
      `Error fetching stream links for episode ID ${episodeId}: ${error.message}`
    );
    return null;
  }
}

// Store new anime data
async function storeAnimeData(animeCollection, animeId, animeInfo, episodes) {
  const animeData = {
    _id: animeId,
    ...animeInfo,
    episodes: episodes,
  };

  try {
    await animeCollection.insertOne(animeData);
    console.log(`Anime data for ${animeInfo.title} stored successfully.`);
  } catch (error) {
    console.error(`Error storing anime data: ${error.message}`);
  }
}

// Store or update episode data
async function storeEpisodeData(episodesCollection, episodeId, episodeData) {
  try {
    await episodesCollection.updateOne(
      { _id: episodeId },
      { $set: episodeData },
      { upsert: true }
    );
    console.log(`Episode data for ${episodeId} stored/updated successfully.`);
  } catch (error) {
    console.error(
      `Error storing episode data for ${episodeId}: ${error.message}`
    );
  }
}

// Update existing anime episodes list
async function updateAnimeEpisodes(animeCollection, animeId, newEpisodes) {
  try {
    await animeCollection.updateOne(
      { _id: animeId },
      { $addToSet: { episodes: { $each: newEpisodes } } } // Add new episodes if they don't already exist
    );
    console.log(`Updated episodes list for anime ID: ${animeId}`);
  } catch (error) {
    console.error(
      `Error updating episodes for anime ID ${animeId}: ${error.message}`
    );
  }
}

// Start the process
fetchAnimeList()
  .then(() => console.log("Data fetching complete."))
  .catch((err) => console.error(`Error fetching anime data: ${err.message}`));
