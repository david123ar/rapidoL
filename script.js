const axios = require('axios');
const { MongoClient } = require('mongodb');

// MongoDB configuration
const mongoUri = 'mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin';
const dbName = 'mydatabase'; // Change the database name as needed

// Initialize MongoDB Client
const client = new MongoClient(mongoUri);

// Fetch data with retry logic
async function fetchWithRetry(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error; // Throw if the last attempt fails
            console.error(`Retrying (${i + 1}/${retries})...`);
            await new Promise(resolve => setTimeout(resolve, delay)); // Wait before retrying
        }
    }
}

async function fetchAnimeList() {
    await client.connect();
    const db = client.db(dbName);
    const animeCollection = db.collection('animeInfo');
    const episodesCollection = db.collection('episodesStream');

    let currentPage = 200; // Change starting page as needed
    const totalPages = 208;

    while (currentPage <= totalPages) {
        console.log(`Processing page number: ${currentPage}`);
        try {
            const response = await fetchWithRetry(`https://vimal.animoon.me/api/az-list?page=${currentPage}`);
            const animeData = response.data.results.data;

            for (const anime of animeData) {
                const { id, title } = anime;
                console.log(`Processing anime: ${title} (ID: ${id}) on page ${currentPage}`);

                // Check if anime already exists in MongoDB
                const existingAnime = await animeCollection.findOne({ _id: id });
                if (existingAnime) {
                    console.log(`Anime ${title} (ID: ${id}) already exists, skipping.`);
                    continue;
                }

                // Fetch anime info and episodes only if anime doesn't exist
                const animeInfo = await fetchAnimeInfo(id);
                const episodes = await fetchEpisodes(id, episodesCollection, currentPage);

                if (animeInfo && episodes.length > 0) {
                    console.log(`Storing anime data for ${title} (ID: ${id}) on page ${currentPage}...`);
                    await storeAnimeData(animeCollection, id, animeInfo, episodes);
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
        const response = await fetchWithRetry(`https://vimal.animoon.me/api/info?id=${id}`);
        return response.data.results;
    } catch (error) {
        console.error(`Error fetching info for anime ID ${id}: ${error.message}`);
        return null;
    }
}

// Fetch episodes
async function fetchEpisodes(id, episodesCollection, currentPage) {
    try {
        const response = await fetchWithRetry(`https://vimal.animoon.me/api/episodes/${id}`);
        const episodes = response.data.results.episodes;

        for (let episode of episodes) {
            const { id: episodeId } = episode;

            // Check if episode already exists in MongoDB
            const existingEpisode = await episodesCollection.findOne({ _id: episodeId });
            if (existingEpisode) {
                console.log(`Episode ${episodeId} already exists on page ${currentPage}, skipping.`);
                continue;
            }

            console.log(`Processing episode ID: ${episodeId} on page ${currentPage}`);
            const streams = await fetchStreamLinks(episodeId);
            episode.streams = streams;
        }
        return episodes;
    } catch (error) {
        console.error(`Error fetching episodes for anime ID ${id} on page ${currentPage}: ${error.message}`);
        return [];
    }
}

// Fetch stream links
async function fetchStreamLinks(episodeId) {
    try {
        const rawStream = await fetchWithRetry(`https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-1&type=raw`);
        const subStream = await fetchWithRetry(`https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-1&type=sub`);
        const dubStream = await fetchWithRetry(`https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-1&type=dub`);

        return {
            raw: rawStream.data.results || null,
            sub: subStream.data.results || null,
            dub: dubStream.data.results || null
        };
    } catch (error) {
        console.error(`Error fetching stream links for episode ID ${episodeId}: ${error.message}`);
        return null;
    }
}

// Store anime data in MongoDB
async function storeAnimeData(animeCollection, animeId, animeInfo, episodes) {
    const animeData = {
        _id: animeId, // Use anime ID as the unique key
        ...animeInfo,
        episodes: episodes.map(episode => episode.id) // Reference episode IDs
    };

    try {
        await animeCollection.insertOne(animeData);
        console.log(`Anime data for ${animeInfo.title} stored successfully.`);

        // Store each episode
        const episodesCollection = client.db(dbName).collection('episodesStream');
        for (const episode of episodes) {
            const { id: episodeId } = episode;
            console.log(`Storing episode data for episode ID: ${episodeId}...`);
            await storeEpisodeData(episodesCollection, episodeId, episode);
        }
    } catch (error) {
        console.error(`Error storing anime data: ${error.message}`);
    }
}

// Store episode data in MongoDB
async function storeEpisodeData(episodesCollection, episodeId, episodeData) {
    console.log(`Storing data for episode ID: ${episodeId}`);
    const episodeDoc = { _id: episodeId, ...episodeData };
    try {
        await episodesCollection.insertOne(episodeDoc);
        console.log(`Episode data for ${episodeId} stored successfully.`);
    } catch (error) {
        console.error(`Error storing episode data for ${episodeId}: ${error.message}`);
    }
}

// Start the process
fetchAnimeList()
    .then(() => console.log('Data fetching complete.'))
    .catch(err => console.error(`Error fetching anime data: ${err.message}`));
