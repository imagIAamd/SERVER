const express = require('express');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

const storage = multer.memoryStorage(); // Save the file to memory
const upload = multer({ storage: storage });

const ERROR = 400;
const OK = 200;

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

const httpServer = app.listen(port, () => {
  console.log(`Listening for HTTP queries on: http://localhost:${port}`);
});

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

function shutDown() {
  console.log('Received kill signal, shutting down gracefully');
  httpServer.close(() => {
    console.log('Closed out remaining connections');
    process.exit(0);
  });
}

app.post('/api/maria/image', upload.single('file'), async (req, res) => {

  try {
    const request_body = req.body;
    let response = await handleImageRequest(request_body);

    if (response !== OK) {
      throw ERROR;
    }

    res.status(200).json({ message: 'Request processed successfully' });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function handleImageRequest(request_body) {

  if (!('data' in request_body)) {
    return ERROR;
  }

  const data = request_body.data;
  console.log(data);

  if (!('prompt' in data && 'token' in data && 'images' in data) && Object.keys(data).length === 3) {
    return ERROR;
  }

  if (typeof(data.prompt) !== 'string') {
    return ERROR    
  }

  if (typeof(data.token) !== 'string') {
    return ERROR    
  }

  if (!(Array.isArray(data.images))) {
    return ERROR    
  }

  // check if the token is valid in DB

  return OK;
}
