require('../css/index.css');

let code = null;

const TrackerWorker = require('./tracker-object.worker');
const DetectWorker = require('./detect-object.worker.js');

const CAMERA_VIEW_ID = 'camera--view';
const CAMERA_OUTPUT_ID = 'camera--output';
const CAMERA_SENSOR_ID = 'camera--sensor';
const CAMERA_TRIGGER_ID = 'camera--trigger';
const FPS = 30;

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

let objectsRecognized = [];
let width;
let height;
let trackerWorker = null;
let detectorWorker = null;

function init() {
  // let scale = PROCESSING_RESOLUTION_WIDTH / settings.width;
  width = cameraView.width = cameraSensor.width = cameraView.videoWidth;
  height = cameraView.height = cameraSensor.height = cameraView.videoHeight;

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
          let context = cameraSensor.getContext('2d');
          context.putImageData(data.imageData, 0, 0);
        });
        trackerObjects();
        break;
      case 'tracker-new-objects-done':
        trackerNewObjects();
        break;
    }
  });
};

function initTrackerParameters() {
  let ctx = cameraSensor.getContext('2d');

  ctx.drawImage(cameraView, 0, 0, cameraSensor.width, cameraSensor.height);

  let imageData = ctx.getImageData(0, 0, cameraSensor.width, cameraSensor.height);
  let parameters = {
    height,
    width,
    imageData
  };

  trackerWorker.postMessage({ type: 'tracker-start', parameters }, [imageData.data.buffer]);
};

function trackerObjects() {
  const ctx = cameraSensor.getContext('2d');

  ctx.drawImage(cameraView, 0, 0, cameraSensor.width, cameraSensor.height);

  const imageData = ctx.getImageData(0, 0, cameraSensor.width, cameraSensor.height);

  let parameters = {
    imageData
  };

  trackerWorker.postMessage({ type: 'tracker-process', parameters });
};

function trackerNewObjects() {
  const ctx = cameraSensor.getContext('2d');

  ctx.drawImage(cameraView, 0, 0, cameraSensor.width, cameraSensor.height);

  const imageData = ctx.getImageData(0, 0, cameraSensor.width, cameraSensor.height);

  let parameters = {
    imageData,
    objectsRecognized
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

cameraStart();

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
