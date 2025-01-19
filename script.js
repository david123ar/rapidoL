const { MongoClient } = require('mongodb'); // Install with `npm install mongodb`
// const fetch = require('node-fetch'); // Install with `npm install node-fetch`

// MongoDB Configuration
const mongoUri = 'mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin';
const dbName = 'mydatabase';
const collectionName = 'animoon-home';

// Initialize MongoDB Client
const client = new MongoClient(mongoUri);

// Fetch and Store Data Function
async function fetchAndStoreData() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    let data;
    let retryCount = 0;

    // Fetch Data and Retry if `genres` is empty
    do {
      const apiUrl = 'https://vimal.animoon.me/api/';
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      data = await response.json();

      if (!data.success || !data.results) {
        throw new Error('Invalid API response structure');
      }

      retryCount++;
      if (retryCount > 5) {
        throw new Error('Max retry attempts reached');
      }
    } while (data.results.genres.length === 0);

    // Process and Store Data
    const results = data.results;

    for (const key in results) {
      const value = results[key];

      if (key === 'genres') {
        // Insert genres directly as a single document
        if (value.length > 0) {
          await collection.updateOne(
            { category: 'genres' },
            { $set: { category: key, data: value, updatedAt: new Date() } },
            { upsert: true }
          );
          console.log(`Genres updated successfully`);
        }
      } else if (Array.isArray(value)) {
        // Filter documents with a `title` field
        const filteredDocuments = value.filter((item) => item.title);

        if (filteredDocuments.length > 0) {
          for (const doc of filteredDocuments) {
            await collection.updateOne(
              { category: key, title: doc.title },
              { $set: { ...doc, category: key, updatedAt: new Date() } },
              { upsert: true }
            );
          }
          console.log(`Updated documents for category "${key}"`);
        }
      } else if (typeof value === 'object' && value !== null && value.title) {
        // Update single object documents with `title`
        await collection.updateOne(
          { category: key, title: value.title },
          { $set: { ...value, category: key, updatedAt: new Date() } },
          { upsert: true }
        );
        console.log(`Updated document for category "${key}"`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Close MongoDB Connection
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Schedule Data Fetch Every Hour
setInterval(fetchAndStoreData, 60 * 60 * 1000);

// Run the Function Immediately
fetchAndStoreData();
