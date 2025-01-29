const { MongoClient } = require('mongodb');

// MongoDB URI and Database details
const mongoUri =
  "mongodb://root:Imperial_king2004@145.223.118.168:27017/?authSource=admin";
const dbName = "mydatabase";
const animeCollectionName = "animeInfo";

// Function to fetch data from the animeInfo collection, process the 'Aired' field, and update documents
async function fetchAndUpdateAiredData() {
  const client = new MongoClient(mongoUri);

  try {
    // Step 1: Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);

    // Step 2: Fetch data from 'animeInfo' collection
    console.log("Fetching data from 'animeInfo' collection...");
    const animeCollection = db.collection(animeCollectionName);
    const animeData = await animeCollection.find({}).toArray();
    console.log(`Fetched ${animeData.length} documents from 'animeInfo' collection.`);

    // Step 3: Function to split a date string (e.g., "Jul-25,-2012") into month, day, and year
    function splitDate(dateStr) {
      console.log(`Splitting date: ${dateStr}`);
      const [month, dayYear] = dateStr.split('-');
      const [day, year] = dayYear.split(',');
      console.log(`Split date: month=${month}, day=${day}, year=${year}`);
      return { month, day, year };
    }

    // Step 4: Iterate through each anime and process the 'Aired' field
    for (const anime of animeData) {
      console.log(`Processing anime: ${anime._id}`);

      const aired = anime.info?.results?.data?.animeInfo?.Aired;
      console.log(`Aired field: ${aired}`);

      let startDate = null;
      let endDate = null;

      // Step 5: If 'Aired' exists and contains '-to-', split it
      if (aired && aired.includes('-to-')) {
        const [startDateStr, endDateStr] = aired.split('-to-').map(date => date.trim());
        console.log(`Split Aired field into: startDateStr=${startDateStr}, endDateStr=${endDateStr}`);

        // Check if the end date is '?' and handle accordingly
        if (endDateStr !== '?' && endDateStr) {
          console.log(`Processing endDate: ${endDateStr}`);
          endDate = splitDate(endDateStr);
        }

        // Split startDate into date, month, year
        console.log(`Processing startDate: ${startDateStr}`);
        startDate = splitDate(startDateStr);
      }

      // Step 6: If 'Aired' only contains a start date (no '-to-'), split it
      if (aired && !aired.includes('-to-')) {
        console.log(`Only start date found in Aired field: ${aired}`);
        startDate = splitDate(aired.trim());
      }

      // Step 7: Prepare the update object with startDate and endDate
      const updateFields = {};
      if (startDate) updateFields.startDate = startDate;
      if (endDate !== null) updateFields.endDate = endDate;

      console.log(`Update fields for anime ${anime._id}: ${JSON.stringify(updateFields)}`);

      // Step 8: If there are any new fields to update, perform the update
      if (Object.keys(updateFields).length > 0) {
        console.log(`Updating document with _id: ${anime._id}`);
        await animeCollection.updateOne(
          { _id: anime._id },  // Find the document by _id
          { $set: updateFields } // Update the startDate and endDate fields
        );
        console.log(`Document with _id: ${anime._id} updated.`);
      }
    }

    console.log("All documents processed successfully!");

  } catch (err) {
    // Step 9: Handle errors
    console.error("Error fetching and updating data:", err);
  } finally {
    // Step 10: Close the MongoDB connection
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Step 11: Call the function to fetch data, process the 'Aired' field, and update the documents
fetchAndUpdateAiredData();
