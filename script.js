const axios = require('axios');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDoc } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDCqUTH6qNdJe89cQ2vqD8tpOk6FL9b2Zk",
  authDomain: "fir-to-firestore.firebaseapp.com",
  databaseURL: "https://firebase-to-firestore-default-rtdb.firebaseio.com",
  projectId: "firebase-to-firestore",
  storageBucket: "firebase-to-firestore.appspot.com",
  messagingSenderId: "547489165252",
  appId: "1:547489165252:web:73260715c633067075be91"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Fetch data from vimal.animoon.me
async function fetchAnimeList() {
  let currentPage = 1;
  const totalPages = 208;

  while (currentPage <= totalPages) {
    try {
      const response = await axios.get(`https://vimal.animoon.me/api/az-list?page=${currentPage}`);
      const animeData = response.data.results.data;

      for (const anime of animeData) {
        const { id, title } = anime;
        console.log(`Fetching data for anime: ${title} (ID: ${id})`);

        // Check if anime already exists in Firestore
        const animeRef = doc(db, 'animeInfo', id.toString());
        const animeDoc = await getDoc(animeRef);
        if (animeDoc.exists()) {
          console.log(`Anime ${title} (ID: ${id}) already exists, skipping.`);
          continue; // Skip fetching data if anime exists
        }

        // Fetch anime info and episodes only if anime doesn't exist
        const animeInfo = await fetchAnimeInfo(id);
        const episodes = await fetchEpisodes(id);

        if (animeInfo && episodes.length > 0) {
          await storeAnimeData(id, animeInfo, episodes);
        }
      }
    } catch (error) {
      console.error(`Error fetching page ${currentPage}: ${error.message}`);
    }
    currentPage++;
  }
}

// Fetch anime info
async function fetchAnimeInfo(id) {
  try {
    const response = await axios.get(`https://hianimes.animoon.me/anime/info?id=${id}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching info for anime ID ${id}: ${error.message}`);
    return null;
  }
}

// Fetch episodes
async function fetchEpisodes(id) {
  try {
    const response = await axios.get(`https://hianimes.animoon.me/anime/episodes/${id}`);
    const episodes = response.data.episodes;

    for (let episode of episodes) {
      const { episodeId } = episode;

      // Check if episode already exists in Firestore
      const episodeRef = doc(db, 'episodesStream', episodeId.toString());
      const episodeDoc = await getDoc(episodeRef);
      if (episodeDoc.exists()) {
        console.log(`Episode ${episodeId} already exists, skipping.`);
        continue; // Skip fetching streams if episode exists
      }

      console.log(`Processing episode ID: ${episodeId}`); // Log the episode ID
      const streams = await fetchStreamLinks(episodeId);
      episode.streams = streams;
    }
    return episodes;
  } catch (error) {
    console.error(`Error fetching episodes for anime ID ${id}: ${error.message}`);
    return [];
  }
}

// Fetch stream links
async function fetchStreamLinks(episodeId) {
  try {
    const rawStream = await axios.get(`https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-1&type=raw`);
    const subStream = await axios.get(`https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-1&type=sub`);
    const dubStream = await axios.get(`https://vimal.animoon.me/api/stream?id=${episodeId}&server=hd-1&type=dub`);

    return {
      raw: rawStream.data,
      sub: subStream.data,
      dub: dubStream.data
    };
  } catch (error) {
    console.error(`Error fetching stream links for episode ID ${episodeId}: ${error.message}`);
    return null;
  }
}

// Store anime data in Firestore
async function storeAnimeData(animeId, animeInfo, episodes) {
  const animeRef = doc(db, 'animeInfo', animeId.toString());
  const animeData = {
    ...animeInfo,
    episodes: episodes.map(episode => episode.episodeId) // Reference episode IDs
  };

  try {
    await setDoc(animeRef, animeData);
    console.log(`Anime data for ${animeInfo.title} stored successfully.`);

    // Store each episode by episodeId
    for (const episode of episodes) {
      const { episodeId } = episode;
      await storeEpisodeData(episodeId, episode);
    }
  } catch (error) {
    console.error(`Error storing anime data: ${error.message}`);
  }
}

// Store episode data with episodeId as key
async function storeEpisodeData(episodeId, episodeData) {
  console.log(`Storing data for episode ID: ${episodeId}`); // Log the episode ID
  const episodeRef = doc(db, 'episodesStream', episodeId.toString());
  try {
    await setDoc(episodeRef, episodeData);
    console.log(`Episode data for ${episodeId} stored successfully.`);
  } catch (error) {
    console.error(`Error storing episode data for ${episodeId}: ${error.message}`);
  }
}

// Start the process
fetchAnimeList()
  .then(() => console.log('Data fetching complete.'))
  .catch(err => console.error(`Error fetching anime data: ${err.message}`));
