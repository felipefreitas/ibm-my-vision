const AI_VISION_URL = '/classify';
const DASHBOARD_API_URL = '/publish';
const RECOGNITION_THRESHOLD = 0.980;

init();

async function init() {
    self.postMessage({ type: 'detector-inited' });

    self.addEventListener('message', ({ data }) => {
        switch (data.type) {
            case "detector-process":
                let objectsRecognized = detectObjects(data.imageBase64, data.code);
                self.postMessage({ type: 'detector-processed', objectsRecognized: objectsRecognized });
                break;
        }
    });
};

async function detectObjects(imageBase64, code) {
    let form = generateFormData('file.jpeg', imageBase64);
    let formData = new FormData();

    formData.append('files', form.get('file'));
    formData.delete('file');

    return await requestToAIVision(formData, code);
};

function generateFormData(filename, base64) {
    return dataUriToFormData(base64, { fileName: filename });
};

function dataUriToFormData(dataURI, options) {
    options = options || {};
    options.form = options.form || new FormData();
    options.form.append('file', dataUriToBlob(dataURI), options.fileName || 'file.jpg');
    return options.form;
};

function dataUriToBlob(dataURI) {
    let byteString;

    if (dataURI.split(',')[0].indexOf('base64') >= 0) {
        byteString = atob(dataURI.split(',')[1]);
    }
    else {
        byteString = window['unescape'](dataURI.split(',')[1]);
    }

    let mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    let ia = new Uint8Array(byteString.length);

    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ia], { type: mimeString });
};

function requestToAIVision(formData, code) {
    let request = new XMLHttpRequest();
    let url = AI_VISION_URL;

    if(code){
        url = url + "?id=" + code
    }

    request.open('POST', url, true);
    request.onreadystatechange = (response) => {
        if(request.readyState === XMLHttpRequest.DONE && request.status === 200) {
			let objects = onSearchSuccess(response.body, code);
            return objects;
		}	
    };

    request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    request.send(formData);
    // return axios({
    //     method: 'POST',
    //     url: AI_VISION_URL + "?id=" + code,
    //     data: formData
    // }).then(response => { return response.data; })
    //     .then(result => {
    //         let objects = onSearchSuccess(result, code);
    //         return objects;
    //     });
};

function onSearchSuccess(result, code) {
    if (result.result === 'success' && result.classified.length > 0) {
        requestToDashboard(result, code);
        return addObjectRecognized(result);
    }
};

function addObjectRecognized(objects) {
    let objectsRecognized = [];

    for (let i = 0; i < objects.classified.length; i++) {
        if (objects.classified[i].confidence >= RECOGNITION_THRESHOLD) {
            let object = {
                x: objects.classified[i].xmin,
                y: objects.classified[i].ymin,
                height: objects.classified[i].ymax - objects.classified[i].ymin,
                width: objects.classified[i].xmax - objects.classified[i].xmin,
                ymin: objects.classified[i].ymin,
                ymax: objects.classified[i].ymax,
                xmin: objects.classified[i].xmin,
                xmax: objects.classified[i].xmax,
                label: objects.classified[i].label
            };

            objectsRecognized.push(object);
        }
    }

    return objectsRecognized;
};

function requestToDashboard(result, code) {
    axios({
        method: 'POST',
        url: DASHBOARD_API_URL,
        data: {
            data: result,
            id: code
        }
    }).then(response => { return response.data; });
};
