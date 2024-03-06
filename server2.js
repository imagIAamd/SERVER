const express = require('express');
const multer = require('multer');
const winston = require('winston');

const app = express();
const port = process.env.PORT || 3000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const SMS_TOKEN = '1mXCtEBqKYcr96XvW1EoN5xqLcvnE5CepzyMmYNV8YpYpkq9pvOYBDqbrb4zwkT9';

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

// Winston configuration
const logFormat = winston.format.combine(
    winston.format.simple(),
    winston.format.timestamp(),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);
const timestamp = new Date().toISOString().replace(/:/g, '_').replace(/\..+/, '');
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        new winston.transports.File({ filename: `./logs/${timestamp}.log`, level: 'info' }),
        new winston.transports.Console()
    ]
});

const httpServer = app.listen(port, () => {
    logger.info(`Listening for HTTP queries on: http://localhost:${port}`);
});

process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

function shutDown() {
    logger.info('Received kill signal, shutting down gracefully');
    httpServer.close(() => {
        logger.info('Closed out remaining connections');
        process.exit(0);
    });
}

// User registration endpoint || WORKING
app.post('/api/maria/user/register', upload.single('file'), async function (req, res) {
    try {
        const request_body = req.body;
        const clientIp = req.ip || req.connection.remoteAddress;

        if (!('phone_number' in request_body) || !('nickname' in request_body) || !('email' in request_body)) {
            logger.warn(`Received request with invalid body from ${clientIp}`);
            res.status(400).json({ message: 'Bad request', status: 'BAD_REQUEST' });
            return;
        }

        const randomNumber = Math.floor(1000 + Math.random() * 9000);
        const requestSMS = await fetch('http://192.168.1.16:8000/api/sendsms/?api_token=' + SMS_TOKEN + '&username=ams26&text=' + randomNumber + '&receiver=' + request_body.phone_number, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!(requestSMS).ok) {
            logger.error("Error requesting SMS code");
            res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
        }

        logger.info(`The SMS code is: ${randomNumber}`);
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

        registerUser.then(response => {
            if (!response.ok) {
                logger.error(`Register user request returned error code: ${response.status}`);
                res.send(response.json());
            }
            return response.json();
        })
            .then(data => {
                logger.info(`Received API response: ${data}`);
                res.send(data);
            })


    } catch (error) {
        logger.error(`Error in maria/user/register endpoint`, error);
        res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
    }
});

// User validation endpoint  || WORKING
app.post('/api/maria/user/validate', upload.single('file'), async function (req, res) {
    try {
        const request_body = req.body;
        const clientIp = req.ip || req.connection.remoteAddress;

        if (!('phone_number' in request_body) || !('validation_code' in request_body)) {
            logger.warn(`Received request with invalid body from ${clientIp}`);
            res.status(400).json({ message: 'Bad request', status: 'BAD_REQUEST' });
            return;
        }

        const validateUser = fetch('http://127.0.0.1:8080/api/user/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                'phone_number': request_body.phone_number,
                'validation_code': request_body.validation_code
            })
        });

        validateUser.then(response => {
            if (!response.ok) {
                logger.error(`Validate user request returned error code: ${response.status}`);
                res.send(response.json());
            }
            return response.json();
        })
            .then(data => {
                logger.info(`Received API response: ${data}`);
                res.send(data);
            })
    } catch (e) {
        logger.error('HTTP Error in maria/iser/validate endpoint', e);
        res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
    }
});

// Insert image endpoint || WORKING
app.post('/api/maria/image', upload.single('file'), processImageRequest);
async function processImageRequest(req, res) {
    try {
        const request_body = req.body;
        const clientIp = req.ip || req.connection.remoteAddress;

        if (!('prompt' in request_body) || !('model' in request_body) || !('images' in request_body)) {
            logger.warn(`Received request with invalid body from ${clientIp}`);
            res.status(400).json({ message: 'Bad request', status: 'BAD_REQUEST' });
            return;
        }
        let images = [];

        if (Array.isArray(request_body.images)) {
            for (let i = 0; i < request_body.images.length; i++) {
                let imageUrl = request_body.images[i].image;
                images.push(imageUrl);
            }
        } else {
            logger.error("data.images is not an array");
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

        if (responseInsert.status !== 200) {
            res.status(429).json({ message: 'Quote is at 0', status: 'Too Many Requests' }
        }

        logger.info('Waiting for Ollama to respond');
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
            logger.error('Error contacting to Ollama');
            res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
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

        logger.info(`recevied request_id: ${requestInsert}`);

        if (!res.headersSent) {
            logger.info("authorization: " + auth);
            const responseInsert = await saveResponse(auth, requestInsert.data.id, aggregatedResponse);

            if (responseInsert !== 200) {
                logger.error('Error inserting the request in the database');
                res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
            }
            res.status(200).json({ message: 'Request processed successfully', aggregatedResponse });
        }
    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            logger.error('HTTP Error in maria/image endpoint', e);
            res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
        }
    }

}
// Save request to the database || WORKING
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

    return api_response.json();
}
// Save response to the database || WORKING
async function saveResponse(access_key, id, text) {
    const dbapi_insert_url = "http://127.0.0.1:8080/api/response/insert";
    console.log(access_key);
    await fetch(dbapi_insert_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': access_key
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
    return 200;
}

// User login endpoint || WORKING
app.post('/api/maria/user/login', upload.single('file'), async function (req, res) {
    try {
        const request_body = req.body;
        const clientIp = req.ip || req.connection.remoteAddress;

        if (!('email' in request_body) || !('password' in request_body)) {
            logger.warn(`Received request with invalid body from ${clientIp}`);
            res.status(400).json({ message: 'Bad request', status: 'BAD_REQUEST' });
            return;
        }

        const loginUser = fetch('http://127.0.0.1:8080/api/user/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                'email': request_body.email,
                'password': request_body.password
            })
        });

        loginUser.then(response => {
            if (!response.ok) {
                logger.error(`Validate user request returned error code: ${response.status}`);
                res.send(response.json());
            }
            return response.json();
        })
            .then(data => {
                logger.info(`Received API response: ${data}`);
                res.send(data);
            })
    } catch (e) {
        logger.error('HTTP Error in maria/iser/validate endpoint', e);
        res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
    }
});

// Get user list endpoint
app.get('/api/maria/user/admin_get_list', upload.single('file'), async function (req, res) {
    try {
        const auth = req.header("Authorization");
        const username = req.query.nickname || null;
        const password = req.query.limit || null;

        let url = 'http://127.0.0.1:8080/api/user/admin_get_list';

        if (username !== null) {
            url += `?username=${encodeURIComponent(username)}`;
        }

        if (password !== null) {
            url += username !== null ? '&' : '?';
            url += `password=${encodeURIComponent(password)}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': auth
            }
        });

        if (!response.ok) {
            logger.error(`Request user list request returned error code: ${response.status}`);
            res.status(response.status).json({ error: 'Error in API request' });
            return;
        }

        const data = await response.json();
        logger.info(`Received API response: ${JSON.stringify(data)}`);
        res.status(200).json(data);

    } catch (e) {
        logger.error('HTTP Error in maria/user/admin_get_list endpoint', e);
        res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
    }
});

app.post('/api/maria/user/admin_change_plan', upload.single('file'), async function (req, res) {
    try {
        const request_body = req.body;
        const clientIp = req.ip || req.connection.remoteAddress;
        const auth = req.header("Authorization");

        if (!('phone_number' in request_body) || !('plan' in request_body)) {
            logger.warn(`Received request with invalid body from ${clientIp}`);
            res.status(400).json({ message: 'Bad request', status: 'BAD_REQUEST' });
            return;
        }

        const loginUser = fetch('http://127.0.0.1:8080/api/user/admin_change_plan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': auth
            },
            body: JSON.stringify({
                'phone_number': request_body.phone_number,
                'plan': request_body.plan
            })
        });

        loginUser.then(response => {
            if (!response.ok) {
                logger.error(`Validate user request returned error code: ${response.status}`);
                res.send(response.json());
            }
            return response.json();
        })
            .then(data => {
                logger.info(`Received API response: ${data}`);
                res.send(data);
            })
    } catch (e) {
        logger.error('HTTP Error in maria/iser/validate endpoint', e);
        res.status(500).json({ message: 'Server error', status: 'INTERNAL_SERVER_ERROR' });
    }
});
