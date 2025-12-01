// Complete Travel & Tours Booking System Backend
// WITH AMADEUS API INTEGRATION FOR REAL FLIGHTS
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Amadeus = require('amadeus');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==================== AMADEUS API SETUP ====================
const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_CLIENT_ID,
  clientSecret: process.env.AMADEUS_CLIENT_SECRET
});

// City to IATA Code Mapping
const cityToIATA = {
  // Pakistan
  'lahore': 'LHE',
  'karachi': 'KHI',
  'islamabad': 'ISB',
  'peshawar': 'PEW',
  'quetta': 'UET',
  'multan': 'MUX',
  'faisalabad': 'LYP',
  'sialkot': 'SKT',
  'gwadar': 'GWD',
  'rawalpindi': 'ISB',
  
  // International
  'dubai': 'DXB',
  'london': 'LHR',
  'new york': 'JFK',
  'toronto': 'YYZ',
  'jeddah': 'JED',
  'riyadh': 'RUH',
  'doha': 'DOH',
  'abu dhabi': 'AUH',
  'istanbul': 'IST',
  'bangkok': 'BKK',
  'kuala lumpur': 'KUL',
  'singapore': 'SIN',
  'manchester': 'MAN',
  'birmingham': 'BHX',
  'paris': 'CDG',
  'tokyo': 'NRT',
  'beijing': 'PEK',
  'sydney': 'SYD',
  'melbourne': 'MEL',
  'cairo': 'CAI',
  'muscat': 'MCT',
  'kuwait': 'KWI',
  'bahrain': 'BAH',
  'sharjah': 'SHJ',
  'medina': 'MED',
  'makkah': 'JED', // Closest airport
  'delhi': 'DEL',
  'mumbai': 'BOM',
  'dhaka': 'DAC'
};

// Helper function to get IATA code
const getIATACode = (city) => {
  if (!city) return null;
  const cityLower = city.toLowerCase().trim();
  
  // Check if already an IATA code (3 letters)
  if (cityLower.length === 3 && /^[a-z]+$/.test(cityLower)) {
    return cityLower.toUpperCase();
  }
  
  return cityToIATA[cityLower] || null;
};

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/travel-booking', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

// ==================== DATABASE MODELS ====================

// User Model
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: String,
  address: String,
  city: String,
  country: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Flight Model
const flightSchema = new mongoose.Schema({
  flightNumber: { type: String, required: true },
  airline: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  departureTime: String,
  arrivalTime: String,
  departureDate: Date,
  duration: String,
  price: Number,
  stops: { type: String, default: 'Non-stop' },
  totalSeats: Number,
  availableSeats: Number,
  class: { type: String, enum: ['Economy', 'Business', 'First'], default: 'Economy' },
  status: { type: String, default: 'scheduled' }
});

const Flight = mongoose.model('Flight', flightSchema);

// Car Rental Model
const carSchema = new mongoose.Schema({
  carName: { type: String, required: true },
  brand: { type: String, required: true },
  model: String,
  year: Number,
  type: { type: String, enum: ['Sedan', 'SUV', 'Luxury', 'Economy', 'Van'], default: 'Sedan' },
  seats: Number,
  transmission: { type: String, enum: ['Automatic', 'Manual'], default: 'Automatic' },
  fuelType: { type: String, enum: ['Petrol', 'Diesel', 'Electric', 'Hybrid'], default: 'Petrol' },
  pricePerDay: Number,
  location: String,
  available: { type: Boolean, default: true },
  features: [String],
  image: String
});

const Car = mongoose.model('Car', carSchema);

// Tour Package Model
const tourSchema = new mongoose.Schema({
  title: { type: String, required: true },
  destination: String,
  duration: String,
  description: String,
  price: Number,
  includes: [String],
  excludes: [String],
  itinerary: [String],
  maxPeople: Number,
  availableSlots: Number,
  startDate: Date,
  endDate: Date,
  image: String,
  rating: { type: Number, default: 4.5 }
});

const Tour = mongoose.model('Tour', tourSchema);

// Transportation Model
const transportationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  route: { type: String, required: true },
  from: String,
  to: String,
  departureTime: String,
  arrivalTime: String,
  price: Number,
  seats: Number,
  availableSeats: Number,
  amenities: [String],
  date: Date
});

const Transportation = mongoose.model('Transportation', transportationSchema);

// Booking Model
const bookingSchema = new mongoose.Schema({
  bookingReference: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bookingType: { type: String, enum: ['flight', 'car', 'tour', 'transportation'], required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  customerInfo: {
    firstName: String,
    lastName: String,
    email: String,
    phone: String
  },
  bookingDetails: mongoose.Schema.Types.Mixed,
  totalAmount: Number,
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  bookingStatus: { type: String, enum: ['confirmed', 'cancelled', 'completed'], default: 'confirmed' },
  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model('Booking', bookingSchema);

// ==================== MIDDLEWARE ====================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: user._id, firstName, lastName, email }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AMADEUS FLIGHT ROUTES ====================

// 🔥 Search Flights using AMADEUS API (Real Data)
app.get('/api/flights/search', async (req, res) => {
  try {
    const { from, to, date, returnDate, adults = 1, travelClass = 'ECONOMY' } = req.query;

    // Validate inputs
    if (!from || !to) {
      return res.status(400).json({ error: 'From and To cities are required' });
    }

    // Convert city names to IATA codes
    const originCode = getIATACode(from);
    const destCode = getIATACode(to);

    if (!originCode) {
      return res.status(400).json({ 
        error: `Unknown city: ${from}. Please use city name or IATA code.`,
        supportedCities: Object.keys(cityToIATA)
      });
    }

    if (!destCode) {
      return res.status(400).json({ 
        error: `Unknown city: ${to}. Please use city name or IATA code.`,
        supportedCities: Object.keys(cityToIATA)
      });
    }

    // Use provided date or default to tomorrow
    const departureDate = date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`🔍 Searching flights: ${originCode} → ${destCode} on ${departureDate}`);

    // Call Amadeus API
    const response = await amadeus.shopping.flightOffersSearch.get({
      originLocationCode: originCode,
      destinationLocationCode: destCode,
      departureDate: departureDate,
      adults: parseInt(adults),
      travelClass: travelClass.toUpperCase(),
      currencyCode: 'PKR',
      max: 50
    });

    // Transform Amadeus response to our format
    const flights = response.data.map((offer, index) => {
      const segment = offer.itineraries[0].segments[0];
      const lastSegment = offer.itineraries[0].segments[offer.itineraries[0].segments.length - 1];
      const totalSegments = offer.itineraries[0].segments.length;
      
      // Parse duration (PT2H30M -> 2h 30m)
      const duration = offer.itineraries[0].duration
        .replace('PT', '')
        .replace('H', 'h ')
        .replace('M', 'm');

      // Get airline name from dictionary
      const airlineCode = segment.carrierCode;
      const airlineName = response.result.dictionaries?.carriers?.[airlineCode] || airlineCode;

      return {
        _id: `amadeus_${offer.id}`,
        flightNumber: `${segment.carrierCode}${segment.number}`,
        airline: airlineName,
        from: from.charAt(0).toUpperCase() + from.slice(1).toLowerCase(),
        to: to.charAt(0).toUpperCase() + to.slice(1).toLowerCase(),
        fromCode: originCode,
        toCode: destCode,
        departureTime: new Date(segment.departure.at).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        arrivalTime: new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        departureDate: segment.departure.at,
        duration: duration,
        price: Math.round(parseFloat(offer.price.total)),
        currency: offer.price.currency,
        stops: totalSegments === 1 ? 'Non-stop' : `${totalSegments - 1} Stop${totalSegments > 2 ? 's' : ''}`,
        availableSeats: offer.numberOfBookableSeats || 9,
        class: offer.travelerPricings[0].fareDetailsBySegment[0].cabin,
        source: 'amadeus',
        bookingClass: offer.travelerPricings[0].fareDetailsBySegment[0].class,
        segments: offer.itineraries[0].segments.map(seg => ({
          departure: seg.departure,
          arrival: seg.arrival,
          carrierCode: seg.carrierCode,
          flightNumber: seg.number,
          aircraft: seg.aircraft?.code
        }))
      };
    });

    console.log(`✅ Found ${flights.length} flights`);

    res.json({ 
      flights, 
      count: flights.length,
      source: 'Amadeus API',
      searchParams: {
        from: originCode,
        to: destCode,
        date: departureDate
      }
    });

  } catch (error) {
    console.error('❌ Amadeus API Error:', error.response?.result || error.message);
    
    // If Amadeus fails, fallback to database
    try {
      const { from, to, date } = req.query;
      const query = {};
      
      if (from) query.from = new RegExp(from, 'i');
      if (to) query.to = new RegExp(to, 'i');
      if (date) {
        const searchDate = new Date(date);
        query.departureDate = {
          $gte: searchDate,
          $lt: new Date(searchDate.getTime() + 24 * 60 * 60 * 1000)
        };
      }

      const flights = await Flight.find(query).sort({ price: 1 });
      res.json({ 
        flights, 
        count: flights.length, 
        source: 'database',
        message: 'Amadeus API unavailable, showing cached results'
      });
    } catch (dbError) {
      res.status(500).json({ error: 'Failed to fetch flights', details: error.message });
    }
  }
});

// Get all flights (from database)
app.get('/api/flights', async (req, res) => {
  try {
    const flights = await Flight.find().limit(50);
    res.json({ flights, source: 'database' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 Get Airport Suggestions (Autocomplete)
app.get('/api/airports/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword || keyword.length < 2) {
      return res.status(400).json({ error: 'Keyword must be at least 2 characters' });
    }

    const response = await amadeus.referenceData.locations.get({
      keyword: keyword,
      subType: 'AIRPORT,CITY'
    });

    const locations = response.data.map(loc => ({
      name: loc.name,
      iataCode: loc.iataCode,
      cityName: loc.address?.cityName,
      countryName: loc.address?.countryName,
      type: loc.subType
    }));

    res.json({ locations, count: locations.length });
  } catch (error) {
    console.error('Airport search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 Get Flight Price Analysis
app.get('/api/flights/price-analysis', async (req, res) => {
  try {
    const { from, to } = req.query;

    const originCode = getIATACode(from);
    const destCode = getIATACode(to);

    if (!originCode || !destCode) {
      return res.status(400).json({ error: 'Invalid city names' });
    }

    const response = await amadeus.analytics.itineraryPriceMetrics.get({
      originIataCode: originCode,
      destinationIataCode: destCode,
      departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });

    res.json({ priceMetrics: response.data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CAR RENTAL ROUTES ====================

app.get('/api/cars', async (req, res) => {
  try {
    const { type, location } = req.query;
    const query = { available: true };
    
    if (type) query.type = type;
    if (location) query.location = new RegExp(location, 'i');

    const cars = await Car.find(query).sort({ pricePerDay: 1 });
    res.json({ cars, count: cars.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cars/:id', async (req, res) => {
  try {
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    res.json(car);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== TOUR PACKAGE ROUTES ====================

app.get('/api/tours', async (req, res) => {
  try {
    const { destination, minPrice, maxPrice } = req.query;
    const query = {};
    
    if (destination) query.destination = new RegExp(destination, 'i');
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    const tours = await Tour.find(query).sort({ price: 1 });
    res.json({ tours, count: tours.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tours/:id', async (req, res) => {
  try {
    const tour = await Tour.findById(req.params.id);
    if (!tour) return res.status(404).json({ error: 'Tour not found' });
    res.json(tour);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== TRANSPORTATION ROUTES ====================

app.get('/api/transportation', async (req, res) => {
  try {
    const { type, from, to, date } = req.query;
    const query = {};
    
    if (type) query.type = type;
    if (from) query.from = new RegExp(from, 'i');
    if (to) query.to = new RegExp(to, 'i');
    if (date) {
      const searchDate = new Date(date);
      query.date = {
        $gte: searchDate,
        $lt: new Date(searchDate.getTime() + 24 * 60 * 60 * 1000)
      };
    }

    const transportation = await Transportation.find(query).sort({ price: 1 });
    res.json({ transportation, count: transportation.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BOOKING ROUTES ====================

app.post('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const { bookingType, serviceId, customerInfo, bookingDetails, totalAmount } = req.body;

    const bookingReference = 'BK' + Date.now().toString(36).toUpperCase();

    const booking = new Booking({
      bookingReference,
      userId: req.user.id,
      bookingType,
      serviceId,
      customerInfo,
      bookingDetails,
      totalAmount,
      paymentStatus: 'completed',
      bookingStatus: 'confirmed'
    });

    await booking.save();

    res.status(201).json({
      message: 'Booking created successfully',
      booking
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bookings/my-bookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    res.json({ bookings, count: bookings.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SUPPORTED CITIES ====================

app.get('/api/cities', (req, res) => {
  const cities = Object.entries(cityToIATA).map(([city, code]) => ({
    name: city.charAt(0).toUpperCase() + city.slice(1),
    code: code
  }));
  res.json({ cities, count: cities.length });
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Travel Booking API is running',
    amadeus: 'Connected',
    timestamp: new Date()
  });
});

// ==================== TEST AMADEUS CONNECTION ====================

app.get('/api/test-amadeus', async (req, res) => {
  try {
    // Test with a simple airport search
    const response = await amadeus.referenceData.locations.get({
      keyword: 'Lahore',
      subType: 'AIRPORT'
    });

    res.json({
      status: 'Amadeus API Connected!',
      testResult: response.data[0],
      message: 'You can now search for real flights!'
    });
  } catch (error) {
    res.status(500).json({
      status: 'Amadeus Connection Failed',
      error: error.response?.result || error.message,
      hint: 'Check your AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET in .env file'
    });
  }
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/api/health`);
  console.log(`✈️  Amadeus API: ${process.env.AMADEUS_CLIENT_ID ? 'Configured' : 'Not Configured'}`);
  console.log(`🔍 Test Amadeus: http://localhost:${PORT}/api/test-amadeus`);
  console.log(`✈️  Search Flights: http://localhost:${PORT}/api/flights/search?from=lahore&to=dubai`);
});