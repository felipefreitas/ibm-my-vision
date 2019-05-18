require('../css/index.css');

const TrackerWorker = require('./tracker-object.worker');
const DetectWorker = require('./detect-object.worker.js');

const CAMERA_VIEW_ID = 'camera--view';
const CAMERA_OUTPUT_ID = 'camera--output';
const CAMERA_SENSOR_ID = 'camera--sensor';
const CAMERA_TRIGGER_ID = 'camera--trigger';
const RECOGNITION_TIMESTAMP = 3000;
const RECOGNITION_THRESHOLD = 0.980;
const FPS = 20;
const DASHBOARD_API_URL = '/publish';
const AI_VISION_URL = '/classify';

const cameraView = document.querySelector("#" + CAMERA_VIEW_ID);
const cameraOutput = document.querySelector("#" + CAMERA_OUTPUT_ID);
const cameraSensor = document.querySelector("#" + CAMERA_SENSOR_ID);
const cameraTrigger = document.querySelector("#" + CAMERA_TRIGGER_ID);

// Set way for requestAnimationFrame
window.requestAnimationFrame = window.requestAnimationFrame
  || window.mozRequestAnimationFrame
  || window.webkitRequestAnimationFrame
  || window.msRequestAnimationFrame
  || function (f) { return setTimeout(f, 1000 / FPS) };

// Set constraints for the video stream
var constraints = { video: { facingMode: "environment" }, audio: false };
var track = null;

let objectsTracked = [];
let objectsRecognized = [];
let canvas;
let video;
let frame;
let matrix;
let matrix_roi;
let screen_roi;
let terminationCriteria;
let HSV;
let HSVVector;
let width;
let height;
let ROI_MAX = 0;
let ROI_MIN = 0;
let trackerWorker = null;
let detectorWorker = null;

function init() {
  width = cameraView.width = cameraSensor.width = cameraView.videoWidth;
  height = cameraView.height = cameraSensor.height = cameraView.videoHeight;
  matrix = new cv.Mat(height, width, cv.CV_8UC4);
  frame = new cv.VideoCapture(cameraView);
  terminationCriteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 10, 1);
  HSV = new cv.Mat(cameraView.height, cameraView.width, cv.CV_8UC3);
  HSVVector = new cv.MatVector();
  HSVVector.push_back(HSV);
  
  initTrackerWorker();
  initDetectorWorker();
};

function initTrackerWorker() {
  console.log('Initializing the object tracker worker');

  trackerWorker = new TrackerWorker('tracker-object-worker.js');
  trackerWorker.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'tracker-inited':
        console.log('Tracker worker initialization finished. Starting detector worker 🚀');
        initTrackerParameters();
        break;
      case 'tracker-processed':
        requestAnimationFrame(() => {
          cv.imshow(CAMERA_SENSOR_ID, data.matrix);
        });
        trackerObjects();
        trackerNewObjects();
        break;
      case 'tracker-new-objects-done':
        trackerNewObjects();
        break;
    }
  });
};

function initTrackerParameters() {
  let parameters = {
    frame,
    matrix,
    HSV,
    HSVVector,
    terminationCriteria
  };

  trackerWorker.postMessage({ type: 'tracker-start', parameters });
};

function trackerObjects() {
  let parameters = {
    matrix,
    objectsTracked
  };

  trackerWorker.postMessage({ type: 'tracker-process', parameters });
};

function trackerNewObjects() {
  let parameters = {
    matrix,
    objectsRecognized,
    objectsTracked
  };

  trackerWorker.postMessage({ type: 'tracker-new-objects', parameters });
};

function initDetectorWorker() {
  console.log('Initializing the object detector worker');

  detectorWorker = new DetectWorker('detector-object-worker.js');
  detectorWorker.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'detector-inited':
        console.log('Detector worker initialization finished. Starting object detection 🚀');
        detectObjects();
        break;
      case 'detector-processed':
        objectsRecognized = data.objectsRecognized;
        detectObjects();
        break;
    }
  });
};

function detectObjects() {
  getBase64('image/jpeg').then(imageBase64 => {
    detectorWorker.postMessage({ type: 'detector-process', imageBase64, code });
  });
};

function getBase64(mime) {
  var ctx = cameraSensor.getContext('2d');
  ctx.drawImage(cameraSensor, 0, 0);
  return Promise.resolve(cameraSensor.toDataURL(mime));
};

async function cameraStart() {
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(function (stream) {
      cameraView.srcObject = stream;
      cameraView.play();
      track = stream.getTracks()[0];
      cameraView.addEventListener('canplay', init, false);
    })
    .catch(function (error) {
      console.error("Oops. Something is broken.", error);
    });
};

cameraTrigger.onclick = function () {
  objectsRecognized = [];
  objectsTracked = [];
};

function loadUI(onloadCallback) {
  window.addEventListener('load', () => {
    if (cv.getBuildInformation) {
      console.log(cv.getBuildInformation());
      onloadCallback();
    }
    else {
      cv['onRuntimeInitialized'] = () => {
        console.log(cv.getBuildInformation());
        onloadCallback();
      }
    }
  });
};

loadUI(() => {
  cameraStart();
});

// Install ServiceWorker
if ('serviceWorker' in navigator) {
  console.log('CLIENT: service worker registration in progress.');
  navigator.serviceWorker.register('../sw.js', { scope: ' ' }).then(function () {
    console.log('CLIENT: service worker registration complete.');
  }, function () {
    console.log('CLIENT: service worker registration failure.');
  });
} else {
  console.log('CLIENT: service worker is not supported.');
}
