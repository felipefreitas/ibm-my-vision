// Define constants
const camera = document.querySelector("#camera"),
  codeCard = document.querySelector(".card");

let code;

// Access the device camera and stream to cameraView
function onCodeSubmit() {
  code = document.querySelector("#room-id").value;
  camera.hidden = false;
  codeCard.hidden = true;
};
