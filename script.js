const { MongoClient } = require('mongodb'); // Install with `npm install mongodb`
// const fetch = require('node-fetch'); // Install with `npm install node-fetch`

// MongoDB Configuration
const mongoUri = 'mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin';
const dbName = 'mydatabase';
const collectionName = 'animoon-schedule';

// Initialize MongoDB Client
const client = new MongoClient(mongoUri);

// Utility function to format date as YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Fetch and Store Data Function
async function fetchAndStoreScheduleData(year, month) {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const firstDate = new Date(year, month - 1, 1); // First day of the month
    const lastDate = new Date(year, month, 0); // Last day of the month

    const scheduleData = [];

    // Fetch data for each day in the month
    for (let date = new Date(firstDate); date <= lastDate; date.setDate(date.getDate() + 1)) {
      const formattedDate = formatDate(date);
      const apiUrl = `https://vimal.animoon.me/api/schedule?date=${formattedDate}`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.error(`Failed to fetch data for ${formattedDate}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      if (data.success && data.results.length > 0) {
        scheduleData.push(...data.results);
        console.log(`Fetched data for ${formattedDate}`);
      }
    }

    if (scheduleData.length > 0) {
      // Update the MongoDB collection with the schedule data
      await collection.updateOne(
        { year, month },
        { $set: { schedule: scheduleData, firstDate: formatDate(firstDate), lastDate: formatDate(lastDate), updatedAt: new Date() } },
        { upsert: true }
      );
      console.log(`Updated schedule for ${year}-${month}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Close MongoDB Connection
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Run the function for the entire month (e.g., for January 2025)
fetchAndStoreScheduleData(2025, 1);

// Optional: You can set this to run periodically for each new month
setInterval(() => {
  const now = new Date();
  fetchAndStoreScheduleData(now.getFullYear(), now.getMonth() + 1);
}, 60 * 60 * 1000); // Run every hour (can adjust as needed)
