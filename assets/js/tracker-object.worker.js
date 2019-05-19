global.Module = {
    locateFile: (path) => {
        const url = `/opencv/${path}`;
        console.log(`⬇️ Downloading wasm from ${url}`);
        return url;
    }
};

const cv = require('./opencv.js');

let HSV = null;
let HSVVector = null;
let terminationCriteria = null;
let objectsTracked = [];
let width = 0;
let height = 0;

cv.onRuntimeInitialized = async () => {
    console.log('📦 OpenCV wasm runtime loaded');
    init();
};

function init() {
    self.postMessage({ type: 'tracker-inited' });

    self.addEventListener('message', ({ data }) => {
        switch (data.type) {
            case "tracker-start":
                width = data.width;
                height = data.height;
                terminationCriteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT, 10, 1);
                HSV = new cv.Mat(height, width, cv.CV_8UC3);
                HSVVector = new cv.MatVector();
                HSVVector.push_back(HSV);

                matrix = cv.matFromImageData(data.image);
                image = processVideo(matrix, objectsTracked);
                self.postMessage({ type: 'tracker-processed', image });
                self.postMessage({ type: 'tracker-new-objects-done' });
                console.info("[WORKER] : Finished tracker-start message.")
                break;
            case "tracker-process":
                matrix = cv.matFromImageData(data.imageData);
                image = processVideo(matrix, objectsTracked);
                self.postMessage({ type: 'tracker-processed', image });
                console.info("[WORKER] : Finished tracker-process message.")
                break;
            case "tracker-new-objects":
                objectsTracked = trackNewObjects(data.matrix, data.objectsRecognized);
                self.postMessage({ type: 'tracker-new-objects-done' });
                console.info("[WORKER] : Finished tracker-new-objects message.")
                break;
        }
    });
};

function processVideo(matrix, objectsTracked) {
    try {
        let matrixAux = new cv.Mat();

        cv.cvtColor(matrix, HSV, cv.COLOR_RGBA2RGB);
        cv.cvtColor(HSV, HSV, cv.COLOR_RGB2HSV);

        for (let i = 0; i < objectsTracked.length; i++) {
            let tracked = objectsTracked[i];
            let object = tracked[0];
            let location = tracked[1];
            let roiHistogram = tracked[2];
            let box = null;

            cv.calcBackProject(HSVVector, [0], roiHistogram, matrixAux, [0, 180], 1);
            [box, location] = cv.CamShift(matrixAux, location, terminationCriteria);
            matrix = drawBoxLabel(box, matrix, object);
        }

        let imageData = new ImageData(new Uint8ClampedArray(matrix.data, matrix.cols, matrix.rows), width, height);

        return imageData;
    } catch (err) {
        console.error(err);
    }
};

function drawBoxLabel(box, matrix, object) {
    let points = cv.rotatedRectPoints(box);

    cv.line(matrix, points[0], points[1], [255, 0, 0, 255], 3);
    cv.line(matrix, points[1], points[2], [255, 0, 0, 255], 3);
    cv.line(matrix, points[2], points[3], [255, 0, 0, 255], 3);
    cv.line(matrix, points[3], points[0], [255, 0, 0, 255], 3);
    cv.putText(matrix, object.label, points[3], cv.FONT_HERSHEY_SIMPLEX, 1.0, [255, 0, 0, 255]);

    return matrix;
};

function trackNewObjects(matrix, objectsRecognized) {
    let objectsToTrack = notTracked(objectsRecognized);

    for (let i = 0; i < objectsToTrack.length; i++) {
        let roiHistogram = null;
        let location = null;

        [location, roiHistogram] = getROIObjectHistogram(matrix, objectsToTrack[i]);
        objectsTracked.push([objectsToTrack[i], location, roiHistogram]);
    }

    return objectsTracked;
};

function getROIObjectHistogram(frame, object) {
    let location = new cv.Rect(object['x'], object['y'], object['width'], object['height']);
    let roi = frame.roi(location);
    let hsvRoi = new cv.Mat();

    cv.cvtColor(roi, hsvRoi, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsvRoi, hsvRoi, cv.COLOR_RGB2HSV);

    let mask = new cv.Mat();
    let lowScalar = new cv.Scalar(30, 30, 0);
    let highScalar = new cv.Scalar(180, 180, 180);
    let low = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), lowScalar);
    let high = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), highScalar);

    cv.inRange(hsvRoi, low, high, mask);

    let roiHist = new cv.Mat();
    let hsvRoiVec = new cv.MatVector();

    hsvRoiVec.push_back(hsvRoi);
    cv.calcHist(hsvRoiVec, [0], mask, roiHist, [180], [0, 180]);
    cv.normalize(roiHist, roiHist, 0, 255, cv.NORM_MINMAX);

    // delete useless mats.
    roi.delete(); hsvRoi.delete(); mask.delete(); low.delete(); high.delete(); hsvRoiVec.delete();

    return [location, roiHist];
};

function notTracked(objectsRecognized) {
    let objectsToTrack = [];

    if (objectsRecognized && objectsRecognized.length < 1) {
        return objectsToTrack;
    }

    if (objectsTracked && objectsTracked.length < 1) {
        return objectsRecognized;
    }

    for (let i = 0; i < objectsRecognized.length; i++) {
        const object = objectsRecognized[i];
        const ymin = object.ymin;
        const ymax = object.ymax;
        const xmin = object.xmin;
        const xmax = object.xmax;
        const xmid = Math.round((xmin + xmax) / 2);
        const ymid = Math.round((ymin + ymax) / 2);
        const boxRange = ((xmax - xmin) + (ymax - ymin)) / 2

        for (let j = 0; j < objectsTracked.length; j++) {
            const tracked = objectsTracked[j];
            const trackedXmin = tracked.x;
            const trackedXmax = tracked.x + tracked.width;
            const trackedYmin = tracked.y;
            const trackedYmax = tracked.y + tracked.height;
            const trackedXmid = (trackedXmin + trackedXmax) / 2;
            const trackedYmid = (trackedYmin + trackedYmax) / 2;

            if (Math.sqrt((xmid - trackedXmid) ^ 2 + (ymid - trackedYmid) ^ 2) < boxRange) {
                break;
            } else {
                objectsToTrack.push(object);
            }
        }
    }

    return objectsToTrack;
};