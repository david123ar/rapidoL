const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const port = 9000;

const mongoUri =
  "mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin";
const dbName = "mydatabase";
const homeCollectionName = "animoon-home";
const animeCollectionName = "animeInfo";

async function fetchData() {
  const client = new MongoClient(mongoUri);
  let data;
  let existingAnime = [];

  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);

    // Fetch homepage data
    const homeCollection = db.collection(homeCollectionName.trim());
    const document = await homeCollection.findOne({});

    if (document) {
      data = document;
    } else {
      console.log("No homepage data found in MongoDB");
    }

    // Check if anime from spotlights exists in the animeInfo collection
    if (data?.spotlights?.length > 0) {
      const animeCollection = db.collection(animeCollectionName.trim());

      // Use Promise.all to fetch data for all spotlight IDs concurrently
      existingAnime = await Promise.all(
        data.spotlights.map(async (spotlight) => {
          const result = await animeCollection.findOne(
            { _id: spotlight.id },
            {
              projection: {
                "info.results.data.animeInfo.Genres": 1,
                "info.results.data.poster": 1,
              },
            }
          );

          if (result) {
            return {
              Genres: result.info?.results?.data?.animeInfo?.Genres || [],
              poster: result.info?.results?.data?.poster || "",
            };
          } else {
            console.log(`Anime ${spotlight.title} not found in database.`);
            return null;
          }
        })
      );

      // Filter out any null results
      existingAnime = existingAnime.filter((item) => item !== null);
    }
  } catch (error) {
    console.error("Error fetching data from MongoDB:", error.message);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }

  return { data, existingAnime };
}

// Define the route for the data
app.get("/api/home", async (req, res) => {
  try {
    const result = await fetchData();
    res.json(result); // Return the data as JSON
  } catch (error) {
    console.error("Error in fetching data:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
