const express = require('express');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 80;

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Constants
const ERROR = 400;
const OK = 200;
const SMS_TOKEN = '1mXCtEBqKYcr96XvW1EoN5xqLcvnE5CepzyMmYNV8YpYpkq9pvOYBDqbrb4zwkT9';

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

// Server setup
const httpServer = app.listen(port, () => {
  console.log(`Listening for HTTP queries on: http://localhost:80`);
});

// Graceful shutdown on SIGTERM or SIGINT
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

function shutDown() {
  console.log('Received kill signal, shutting down gracefully');
  httpServer.close(() => {
    console.log('Closed out remaining connections');
    process.exit(0);
  });
}

// API endpoint for processing images
app.post('/api/maria/image', upload.single('file'), processImageRequest);

async function processImageRequest(req, res) {
  try {
    const request_body = req.body;
    let images = [];

    if (Array.isArray(request_body.images)) {
      for (let i = 0; i < request_body.images.length; i++) {
        let imageUrl = request_body.images[i].image;
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

    // Save request to the database
    const auth = req.header("Authorization");
    const requestInsert = await saveRequest(req.body, auth);

    console.log('Waiting for Ollama to respond');
    const responseGenerate = await fetch('http://192.168.1.14:11434/api/generate', {
      method: 'POST',
      mode: "cors",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBodyJSON,
    });

    if (!responseGenerate.ok) {
      throw new Error(`Error`);
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
      console.log("authorization: " + auth);
      const responseInsert = await saveResponse(auth, requestInsert.id, aggregatedResponse);

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
}

// Save request to the database
async function saveRequest(request_body, authorization) {
  const dbapi_insert_url = "http://127.0.0.1:8080/api/request/insert";

  const api_response = await fetch(dbapi_insert_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization
    },
    body: JSON.stringify(request_body)
  }).then(response => {
    if (!response.ok) {
      console.log('Error: connecting to dbAPI');
    }
    return response;
  });

  console.log('Request inserted successfully');
  console.log(await api_response);
  return await api_response;
}

// Save response to the database
async function saveResponse(access_key, id, text) {
  const dbapi_insert_url = "http://127.0.0.1:8080/api/response/insert";

  await fetch(dbapi_insert_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + access_key
    },
    body: JSON.stringify({
      'request_id': id,
      'text': text
    })
  }).then(response => {
    if (!response.ok) {
      console.log('Error: connecting to dbAPI');
    }
    return response;
  });

  console.log('Response inserted successfully');
  return OK;
}

// API endpoint for user registration
app.post('/api/maria/user/register', upload.single('file'), processUserRegistration);

async function processUserRegistration(req, res) {
  try {
    const request_body = req.body;
    /*
    if (!(isValidUser(request_body))) {
      throw new Error('missing body parameters.');
    }
    */
    const randomNumber = Math.floor(1000 + Math.random() * 9000);
    const requestSMS = fetch('http://192.168.1.16:8000/api/sendsms/?api_token=' + SMS_TOKEN + '&username=ams26&text=' + randomNumber + '&receiver=' + request_body.phone_number, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!(await requestSMS).ok) {
      throw new Error('Error sending SMS');
    }
    
    const registerUser = fetch('http://127.0.0.1:8080/api/user/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        'phone_number': request_body.phone_number,
        'nickname': request_body.nickname,
        'email': request_body.email,
        'validation_code': randomNumber
      })
    });
    
    if (!((await registerUser).ok)) {
      throw new Error('Error inserting tmp user');
    }

    if (!res.headersSent) {
      res.status(200).json({ status: 'OK', message: "Waiting validation" });
    }

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }    
  }
}

function isValidUser(body) {
  if (!('nickname' in body && 'email' in body && 'phone_number' in body)) {
    return false;
  }

  return true;
}

// API endpoint for user validation
app.post('/api/maria/user/validate', upload.single('file'), processUserValidation);

async function processUserValidation(req, res) {
  try {
    const request_body = req.body;
    const validateUser = await fetch('http://127.0.0.1:8080/api/user/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'phone_number': request_body.phone_number,
          'validation_code': request_body.validation_code
        })
      });
      
      if (!(validateUser.ok)) {
        throw new Error('Error inserting tmp user');
      }

      const responseBody = await validateUser.json();

      if (!res.headersSent) {
        console.log(validateUser);
        res.status(200).json(validateUser.body);
      }    

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }  
  }
}


app.post('/api/maria/user/login', upload.single('file'), processUserLogin);

async function processUserLogin(req, res) {
  try {
    const request_body = req.body;
    const userLogin = await fetch('http://127.0.0.1:8080/api/user/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'email': request_body.email,
          'password': request_body.password
        })
      });
      
      if (!(userLogin.ok)) {
        throw new Error('Error during login');
      }

      const responseBody = await userLogin.json();
    
      if (!res.headersSent) {
        console.log(userLogin);
        res.status(200).json(userLogin.body);
      }    

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }  
  }
}
