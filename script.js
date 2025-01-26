const { MongoClient } = require('mongodb');
// const fetch = require('node-fetch'); // Ensure this is installed with `npm install node-fetch`

// MongoDB Configuration
const mongoUri = 'mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin';
const dbName = 'mydatabase';
const collectionName = 'animoon-home';

// Initialize MongoDB Client
const client = new MongoClient(mongoUri);

// Function to parse time strings and add 30 minutes
function addMinutesToTime(timeString, minutesToAdd) {
  const [hour, minute] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hour, minute + minutesToAdd, 0, 0);
  return date;
}

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

    const { schedule } = data.results.today || {};

    // Filter titles with specific conditions
    const filteredSchedule = schedule.filter((item) => {
      // Add your title conditions here. For example:
      return item.title;
    });

    // Wait for the scheduled time (+30 minutes) to fetch again
    for (const item of filteredSchedule) {
      const targetTime = addMinutesToTime(item.time, 30);
      const now = new Date();

      if (targetTime > now) {
        const delay = targetTime - now;
        console.log(`Waiting ${delay / 1000} seconds to fetch again for title: ${item.title}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        await fetchAndStoreData(); // Re-fetch data after the delay
      }
    }

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

// Run the Function Immediately
fetchAndStoreData();
