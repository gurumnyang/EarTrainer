// Import required modules
const express = require('express');
const fileUpload = require('express-fileupload');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const WaveSurfer = require('wavesurfer.js');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Middleware setup
app.use(fileUpload());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Storage for user sessions and files (replace with DB in production)
const userSessions = {};
const audioFiles = {};

// Route: Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Route: Upload audio
app.post('/upload', (req, res) => {
  if (!req.files || !req.files.audio) {
    return res.status(400).send('No audio file uploaded.');
  }

  const audioFile = req.files.audio;
  const fileId = uuidv4();
  const uploadPath = path.join(__dirname, 'uploads', fileId + path.extname(audioFile.name));

  audioFile.mv(uploadPath, (err) => {
    if (err) return res.status(500).send(err);

    audioFiles[fileId] = { path: uploadPath, originalName: audioFile.name };
    res.send({ fileId, message: 'File uploaded successfully.' });
  });
});

// Route: Process audio with noise
app.post('/process', (req, res) => {
  const { fileId, noiseLevel, volumeAdjustment } = req.body;

  if (!audioFiles[fileId]) {
    return res.status(404).send('Audio file not found.');
  }

  const inputPath = audioFiles[fileId].path;
  const outputPath = path.join(__dirname, 'processed', `${fileId}-processed.wav`);

  const duration = 196.96; // 입력 파일의 길이
  ffmpeg(inputPath)
  .outputOptions([
    '-filter_complex',
    'anoisesrc=d=196.96:sample_rate=44100[noise];[0:a][noise]amix=inputs=2:duration=shortest'
  ])
  .audioCodec('libmp3lame') // MP3 코덱 설정
  .audioBitrate(192) // 비트레이트 192 kbps
  .on('start', (commandLine) => {
    console.log('FFmpeg command:', commandLine);
  })
  .on('end', () => {
    res.send({
      message: 'Audio processed successfully.',
      outputPath: outputPath,
    });
  })
  .on('error', (err) => {
    console.error('Error processing audio:', err.message);
    res.status(500).send('Error processing audio.');
  })
  .save(outputPath);
  
});

// Route: Visualize audio waveform
app.get('/waveform/:fileId', (req, res) => {
  const { fileId } = req.params;

  if (!audioFiles[fileId]) {
    return res.status(404).send('Audio file not found.');
  }

  const audioPath = audioFiles[fileId].path;
  res.sendFile(audioPath); // Serve audio file to frontend for visualization
});

// Route: Fetch user progress
app.get('/progress/:userId', (req, res) => {
  const { userId } = req.params;
  const userProgress = userSessions[userId] || { levelsCompleted: 0, accuracy: 0 };
  res.send(userProgress);
});

// Route: Update user progress
app.post('/progress/:userId', (req, res) => {
  const { userId } = req.params;
  const { levelsCompleted, accuracy } = req.body;

  if (!userSessions[userId]) {
    userSessions[userId] = { levelsCompleted: 0, accuracy: 0 };
  }

  userSessions[userId].levelsCompleted += levelsCompleted || 0;
  userSessions[userId].accuracy = Math.max(userSessions[userId].accuracy, accuracy || 0);

  res.send({ message: 'Progress updated successfully.', progress: userSessions[userId] });
});

// Helper function: Ensure directories exist
const ensureDirectoryExistence = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Ensure necessary directories exist
ensureDirectoryExistence(path.join(__dirname, 'uploads'));
ensureDirectoryExistence(path.join(__dirname, 'processed'));

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
