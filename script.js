const { MongoClient } = require('mongodb'); // Install with `npm install mongodb`
// const fetch = require('node-fetch'); // Install with `npm install node-fetch`

// MongoDB Configuration
const mongoUri = 'mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin';
const dbName = 'mydatabase';
const collectionName = 'animoon-pages';

// Categories to Fetch
const categories = [
  "top-airing", "most-popular", "most-favorite", "completed", "recently-updated", "recently-added",
  "top-upcoming", "subbed-anime", "dubbed-anime", "movie", "special", "ova", "ona", "tv",
  "genre/action", "genre/adventure", "genre/cars", "genre/comedy", "genre/dementia", "genre/demons",
  "genre/drama", "genre/ecchi", "genre/fantasy", "genre/game", "genre/harem", "genre/historical",
  "genre/horror", "genre/isekai", "genre/josei", "genre/kids", "genre/magic", "genre/martial-arts",
  "genre/mecha", "genre/military", "genre/music", "genre/mystery", "genre/parody", "genre/police",
  "genre/psychological", "genre/romance", "genre/samurai", "genre/school", "genre/sci-fi",
  "genre/seinen", "genre/shoujo", "genre/shoujo-ai", "genre/shounen", "genre/shounen-ai",
  "genre/slice-of-life", "genre/space", "genre/sports", "genre/super-power", "genre/supernatural",
  "genre/thriller", "genre/vampire", "az-list", "az-list/other", "az-list/0-9", "az-list/a", "az-list/b",
  "az-list/c", "az-list/d", "az-list/e", "az-list/f", "az-list/g", "az-list/h", "az-list/i", "az-list/j",
  "az-list/k", "az-list/l", "az-list/m", "az-list/n", "az-list/o", "az-list/p", "az-list/q", "az-list/r",
  "az-list/s", "az-list/t", "az-list/u", "az-list/v", "az-list/w", "az-list/x", "az-list/y", "az-list/z"
];

// Fetch and Update Data Function
async function fetchAndUpdateData() {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    for (const category of categories) {
      let page = 1;
      let totalPages = 1;

      do {
        const apiUrl = `https://vimal.animoon.me/api/${encodeURIComponent(category)}?page=${page}`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
          console.error(`Failed to fetch category "${category}" page ${page}: ${response.statusText}`);
          break;
        }

        const data = await response.json();

        if (!data.success || !data.results || !data.results.data) {
          console.error(`Invalid or empty response for category "${category}" page ${page}`);
          break;
        }

        totalPages = data.results.totalPages || 1;
        const resultsData = data.results.data;

        for (const item of resultsData) {
          // Only update if `title` field exists in the response
          if (item.title) {
            await collection.updateOne(
              { category, page, id: item.id }, // Filter by category, page, and unique ID
              {
                $set: {
                  ...item,
                  category,
                  page,
                  updatedAt: new Date()
                }
              },
              { upsert: true } // Create a new document if it doesn't exist
            );
            console.log(`Updated document for category "${category}" page ${page}, ID: ${item.id}`);
          }
        }

        page++;
      } while (page <= totalPages);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Run Process Continuously
(async function runContinuously() {
  while (true) {
    console.log('Starting data update at', new Date().toISOString());

    await fetchAndUpdateData();

    console.log('Data update completed. Restarting after 6 hours...');
    // Wait for 6 hours (21600000 ms) before restarting
    await new Promise((resolve) => setTimeout(resolve, 21600000));
  }
})();
