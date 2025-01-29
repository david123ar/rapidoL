const { MongoClient } = require("mongodb");

// MongoDB URI and Database details
const mongoUri =
  "mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin";
const dbName = "mydatabase";
const animeCollectionName = "animeInfo";

// Function to fetch data from the animeInfo collection, process the 'MAL Score' field, and update documents
async function fetchAndUpdateMALScoreData() {
  const client = new MongoClient(mongoUri);

  try {
    // Step 1: Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    const animeCollection = db.collection(animeCollectionName);

    let hasMoreData = true;
    let lastProcessedId = null;

    // Step 2: Process each document one by one
    while (hasMoreData) {
      // Fetch one document at a time, starting after the last processed document
      const query = lastProcessedId ? { _id: { $gt: lastProcessedId } } : {};
      const anime = await animeCollection.findOne(query);

      if (!anime) {
        console.log("No more documents to process.");
        hasMoreData = false;
        break;
      }

      // Update last processed ID for pagination
      lastProcessedId = anime._id;

      console.log(`Processing anime: ${anime._id}`);

      const malScore = anime.info?.results?.data?.animeInfo?.["MAL Score"];
      console.log(`MAL Score field: ${malScore}`);

      let malScoreAsNumber = null;

      // If MAL Score exists and is not "?" (assuming "?" means missing or invalid)
      if (malScore && malScore !== "?") {
        // Convert MAL Score to number (float)
        malScoreAsNumber = parseFloat(malScore);
        console.log(`Converted MAL Score to number: ${malScoreAsNumber}`);
      } else {
        console.log("MAL Score is invalid or missing.");
      }

      // Prepare the update object with MAL Score outside of 'info'
      const updateFields = { MAL_Score: malScoreAsNumber };

      console.log(
        `Update fields for anime ${anime._id}: ${JSON.stringify(updateFields)}`
      );

      // Perform the update for the current document
      await animeCollection.updateOne(
        { _id: anime._id }, // Find the document by _id
        { $set: updateFields } // Update the MAL Score field at the root level
      );
      console.log(`Document with _id: ${anime._id} updated.`);
    }

    console.log("All documents processed successfully!");
  } catch (err) {
    // Handle errors
    console.error("Error fetching and updating data:", err);
  } finally {
    // Close the MongoDB connection
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Call the function to fetch data, process the 'MAL Score' field, and update the documents
fetchAndUpdateMALScoreData();
