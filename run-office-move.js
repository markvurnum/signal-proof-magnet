// Launch the magnet on the ALREADY-MOVED shelf on its own port.
// Flip SERVICE per request with ?service=it|telecoms|software|insurance
process.env.SIGNAL = 'office-moved';
process.env.PORT = process.env.PORT || '4051';
require('./server.js');
