const express = require('express');
const app = express();
app.get('/health', (req, res) => res.status(200).send('ok'));
app.get('/', (req, res) => res.send('Backend API running'));
app.listen(3000, () => console.log('Backend listening on 3000'));