const express = require('express');
const axios = require('axios');
const redis = require('redis');

const app = express();
const PORT = 3000;
const REDIS_PORT = 6379;
const PAGE_SIZE = 10; // Number of items per page

// Create Redis client
const client = redis.createClient(REDIS_PORT);

client.on('error', (err) => {
  console.error('Redis error:', err);
});

// Connect to Redis
client.connect().catch(err => {
  console.error('Could not connect to Redis:', err);
});

app.set('view engine', 'ejs');

// Function to process hierarchy
const processHierarchy = (name) => {
  return name.split('\\').map(part => part.trim());  // Split by backslash and trim whitespace
};

// Function to fetch data from API and cache it
const fetchAndCacheData = async () => {
  try {
    const response = await axios.get('https://gr5.gosreestr.kz/p/ru/api/v1/gr-objects');
    const organizations = response.data.Objects.map(org => ({
      flBin: org.flBin,
      flNameParts: processHierarchy(org.flNameRu),
      flOpf: org.flOpf,
      flKfsL0: org.flKfsL0,
      flOkedL0: org.flOkedL0,
      flStateInvolvement: org.flStateInvolvement,
      flStatus: org.flStatus,
      flKfsL1: org.flKfsL1,
      flKfsL2: org.flKfsL2,
      flOwnerBin: org.flOwnerBin,
      flOguBin: org.flOguBin
    }));

    // Save the API response in cache
    await client.set('organizations', JSON.stringify(organizations));
    console.log('Data saved to Redis');
  } catch (apiError) {
    console.error('Error fetching data from API:', apiError);
  }
};

// Helper function to safely get the lowercased string representation
const safeToLowerCase = (value) => (value ? value.toString().toLowerCase() : '');

app.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // Get page number from query, default to 1
    const searchQuery = req.query.search ? req.query.search.toLowerCase() : ''; // Get search query

    const cachedData = await client.get('organizations');
    if (cachedData) {
      // Data found in cache
      let organizations = JSON.parse(cachedData);

      // Filter organizations based on search query
      if (searchQuery) {
        organizations = organizations.filter(org => {
          return (
            safeToLowerCase(org.flBin).includes(searchQuery) ||
            safeToLowerCase(org.flOpf).includes(searchQuery) ||
            safeToLowerCase(org.flKfsL0).includes(searchQuery) ||
            safeToLowerCase(org.flOkedL0).includes(searchQuery) ||
            safeToLowerCase(org.flStateInvolvement).includes(searchQuery) ||
            safeToLowerCase(org.flStatus).includes(searchQuery) ||
            safeToLowerCase(org.flKfsL1).includes(searchQuery) ||
            safeToLowerCase(org.flKfsL2).includes(searchQuery) ||
            safeToLowerCase(org.flOwnerBin).includes(searchQuery) ||
            safeToLowerCase(org.flOguBin).includes(searchQuery) ||
            org.flNameParts.some(part => part.toLowerCase().includes(searchQuery))
          );
        });
      }

      const totalItems = organizations.length;
      const totalPages = Math.ceil(totalItems / PAGE_SIZE);
      const startIndex = (page - 1) * PAGE_SIZE;
      const paginatedData = organizations.slice(startIndex, startIndex + PAGE_SIZE);

      console.log(`Rendering page ${page} of ${totalPages} with search query "${searchQuery}"`);
      res.render('index', {
        organizations: paginatedData,
        currentPage: page,
        totalPages: totalPages,
        searchQuery: searchQuery
      });
    } else {
      // Data not found in cache, fetch from API
      await fetchAndCacheData();
      res.redirect(`/?page=${page}`); // Redirect to ensure cache is used
    }
  } catch (error) {
    console.error('Error in main handler:', error);
    res.status(500).send('Error in main handler');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});