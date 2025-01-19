const { MongoClient } = require('mongodb');
// const fetch = require('node-fetch'); // Ensure this is installed with `npm install node-fetch`

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

    // Fetch Data and Retry if `results` is empty
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
    } while (Object.keys(data.results).length === 0);

    // Store the entire `results` object as a single document
    await collection.updateOne(
      { _id: 'animoon-home' }, // Use a fixed _id for easy retrieval
      { $set: { ...data.results, updatedAt: new Date() } },
      { upsert: true } // Insert if not exists, update otherwise
    );

    console.log('Data stored successfully in animoon-home collection');
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
