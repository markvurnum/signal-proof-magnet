// Launch the magnet on the MOVING-SOON shelf on its own port.
// Flip SERVICE per request with ?service=it|telecoms|software|insurance
process.env.SIGNAL = 'office-moving-soon';
process.env.PORT = process.env.PORT || '4052';
require('./server.js');
