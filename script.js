const { MongoClient } = require("mongodb");

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

      const aired = anime.info?.results?.data?.animeInfo?.Aired;
      console.log(`Aired field: ${aired}`);

      let startDate = null;
      let endDate = null;

      // If 'Aired' exists and contains '-to-', split it
      if (aired && aired.includes("-to-")) {
        const [startDateStr, endDateStr] = aired
          .split("-to-")
          .map((date) => date.trim());
        console.log(
          `Split Aired field into: startDateStr=${startDateStr}, endDateStr=${endDateStr}`
        );

        // Check if the end date is '?' and handle accordingly
        if (endDateStr !== "?" && endDateStr) {
          console.log(`Processing endDate: ${endDateStr}`);
          endDate = splitDate(endDateStr);
        }

        // Split startDate into date, month, year
        console.log(`Processing startDate: ${startDateStr}`);
        startDate = splitDate(startDateStr);
      }

      // If 'Aired' only contains a start date (no '-to-'), split it
      if (aired && !aired.includes("-to-")) {
        console.log(`Only start date found in Aired field: ${aired}`);
        startDate = splitDate(aired.trim());
      }

      // If no 'Aired' data, set all date fields to null
      if (!aired || aired === "?") {
        console.log(
          `No Aired field found or it contains '?'. Setting all date fields to null.`
        );
        startDate = { month: null, day: null, year: null };
        endDate = null;
      }

      // Prepare the update object with startDate and endDate
      const updateFields = { startDate, endDate };

      console.log(
        `Update fields for anime ${anime._id}: ${JSON.stringify(updateFields)}`
      );

      // Perform the update for the current document
      await animeCollection.updateOne(
        { _id: anime._id }, // Find the document by _id
        { $set: updateFields } // Update the startDate and endDate fields
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

// Function to split a date string (e.g., "Jul-12,-2014") into month, day, and year
function splitDate(dateStr) {
  if (!dateStr || dateStr === "?") {
    return { month: null, day: null, year: null }; // Return null values if the date is invalid
  }

  console.log(`Splitting date: ${dateStr}`);

  // Clean the date string by removing any unwanted characters like commas

  const newDate = dateStr.split(',')

  const month = newDate[0].split('-')[0]
  const day = newDate[0].split('-')[1]
  const year = newDate[1].replace('-',"")


  console.log(`Split date: month=${month}, day=${day}, year=${year}`);

  // Handle the case where year might be undefined due to unexpected format
  return {
    month,
    day,
    year: year ? year.trim() : null, // Trim and handle undefined year
  };
}

// Call the function to fetch data, process the 'Aired' field, and update the documents
fetchAndUpdateAiredData();
