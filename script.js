const axios = require("axios");
const { MongoClient } = require("mongodb");

// MongoDB connection details
const mongoUri =
  "mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin";
const dbName = "mydatabase";

async function fetchAndInsert() {
  try {
    // MongoDB Client Setup
    const client = new MongoClient(mongoUri);
    await client.connect();
    console.log("Connected to MongoDB.");
    const db = client.db(dbName);
    const animeInfoCollection = db.collection("animeInfo");

    // Fetch top-upcoming data
    const baseUrl = "https://vimal.animoon.me/api/top-upcoming";
    const infoUrl = "https://vimal.animoon.me/api/info?id=";

    // First request to determine total pages
    const initialResponse = await axios.get(`${baseUrl}?page=1`);
    const { totalPages } = initialResponse.data.results;

    console.log(`Total pages: ${totalPages}`);

    for (let page = 1; page <= totalPages; page++) {
      console.log(`Fetching page ${page}...`);
      const pageResponse = await axios.get(`${baseUrl}?page=${page}`);
      const animeList = pageResponse.data.results.data;

      for (const anime of animeList) {
        const { id } = anime;

        // Check if the document already exists in the collection
        const exists = await animeInfoCollection.findOne({ _id: id });
        if (exists) {
          console.log(`Skipping ${id}, already exists.`);
          continue;
        }

        console.log(`Fetching details for ${id}...`);
        const animeDetailsResponse = await axios.get(`${infoUrl}${id}`);
        const animeDetails = animeDetailsResponse.data;

        // Insert into MongoDB
        if (animeDetails.results.data.title) {
          await animeInfoCollection.insertOne({
            _id: id, // Use ID as the document key
            info: animeDetails,
            episodes: {
              results: {
                totalEpisodes: 0,
                episodes: [],
              },
            },
          });
          console.log(`Inserted ${id}.`);
        } else {
          console.log(`No Data found in response for ${id} , Skipping`);
        }
      }
    }

    console.log("Data fetching and insertion complete.");
    await client.close();
  } catch (error) {
    console.error("Error occurred:", error.message);
  }
}

// Schedule the function to run every 24 hours
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

fetchAndInsert(); // Run the function immediately
setInterval(fetchAndInsert, ONE_DAY_IN_MS); // Schedule to run every 24 hours
