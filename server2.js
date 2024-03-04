const express = require('express');
const multer = require('multer');
const winston = require('winston');

const app = express();
const port = process.env.PORT || 80;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const SMS_TOKEN = '1mXCtEBqKYcr96XvW1EoN5xqLcvnE5CepzyMmYNV8YpYpkq9pvOYBDqbrb4zwkT9';

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

// Winston configuration
const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json());
    
    const logger = winston.createLogger({
        level: 'info',
        format: logFormat,
        transports: [
            new winston.transports.File({ filename: 'logs.log', level: 'info' })
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
    
    app.post('/api/maria/user/register', upload.single('file'), async function (req, res) {
        try {
            const request_body = req.body;
            const randomNumber = Math.floor(1000 + Math.random() * 9000);
            const requestSMS = await fetch('http://192.168.1.16:8000/api/sendsms/?api_token=' + SMS_TOKEN + '&username=ams26&text=' + randomNumber + '&receiver=' + request_body.phone_number, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }});  

            if (!(requestSMS).ok) {
                logger.error("Error requesting SMS code");
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
                })});

            registerUser.then(response => {
                if (!response.ok) {
                    logger.error(`Register user request returned error code: ${response.status}`);
                    throw new Error(`HTTP Error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                logger.info(`Received API response: ${data}`);
                res.send(data);
            })


        } catch (e) {
            logger.error(`Error in maria/user/register endpoint`, e);
        }
    });
    
    
    