const express = require('express');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const ERROR = 400;
const OK = 200;

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

const httpServer = app.listen(port, () => {
  console.log(`Listening for HTTP queries on: http://localhost:3000`);
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
    let images = [];

    if (Array.isArray(request_body.data.images)) {
      for (let i = 0; i < request_body.data.images.length; i++) {
        let imageUrl = request_body.data.images[i].image;
        images.push(imageUrl);
      }
    } else {
      console.error("data.images is not an array");
    }

    const requestBody = {
      model: "llava",
      images: images,
      prompt: "Describe the images"
    };

    const requestBodyJSON = JSON.stringify(requestBody);

    console.log("Incoming authorization: " + req.header("Authorization"));
    const requestInsert = await saveRequest(req.body, req.header("Authorization"));
    const responseGenerate = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      mode: "cors",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBodyJSON,
    });

    if (!responseGenerate.ok) {
      throw new Error(`HTTP error! Status: ${responseGenerate.status}`);
    }

    res.contentType('application/json');

    const reader = responseGenerate.body.getReader();

    let aggregatedResponse = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const jsonData = JSON.parse(new TextDecoder().decode(value));
      aggregatedResponse += jsonData.response;
    }

    if (!res.headersSent) {
      responseInsert = await saveResponse(res.getHeader("Authorization"));

      if (responseInsert !== OK) {
        throw ERROR;
      }
      res.status(200).json({ message: 'Request processed successfully', aggregatedResponse });
    }
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

async function saveRequest(request_body, authorization) {
  const dbapi_insert_url = "http://127.0.0.1:8080/api/request/insert";

  if (!('data' in request_body)) {
    return ERROR;
  }

  const data = request_body.data;

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

  await fetch(dbapi_insert_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization
    },
    body: JSON.stringify(data)
  }).then(response => {
    if(!response.ok) {
      console.log('Error: connecting to dbAPI');
    }
    return response;
  }).then (data => {
    
  })

  return OK;
}

async function saveResponse(access_key, id, text) {
  const dbapi_insert_url = "http://127.0.0.1:8080/api/response/insert";

  await fetch(dbapi_insert_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': access_key
    },
    body: {
      'request_id': id,
      'text': text
    }
  }).then(response => {
    if(!response.ok) {
      console.log('Error: connecting to dbAPI');
    }
    return response;
  }).then (data => {
    
  })

  return OK;
}
