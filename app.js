const path = require('path');
const co = require('co');
const koa = require('koa');
const mount = require('koa-mount');
const staticServe = require('koa-static');
const router = require('koa-router')();
const swig = require('koa-swig');
const util = require('./util');
const request = require('request');
const app = new koa();

if (util.isProduction()) {
    console.log('🏭  App runs in PRODUCTION.');
}
else {
    console.log('👷  App runs in DEVELOPMENT.');
};

const port = process.env.PORT || 3000;

app.context.port = port;

app.context.render = co.wrap(swig({
    root: path.join(__dirname, 'views'),
    autoescape: true,
    cache: util.isProduction() ? 'memory' : false,
    ext: 'html',
    writeBody: false
}));

router.get('/', async (ctx, next) => {
    ctx.body = await ctx.render('index.html');
});

var server = require('http').createServer(app.callback())
var io = require('socket.io')(server)

const AI_VISION_API = 'https://177.102.239.202:1100/powerai-vision/api/dlapis/6bce3622-8f7e-4773-8cf4-fab14856851c';
let api = {};

io.on('connection', (socket) => {
    console.log("connection");
    socket.on('room', (obj) => {
        console.log("connection on room", obj.id, obj);
        socket.join(obj.id);
        api[obj.id] = {
            url: obj.url,
            endpoint: obj.endpoint
        };
    });

    socket.on('getRooms', () => {
        socket.emit('getRooms', socket.adapter.rooms);
    });
});

router.post('/publish', (req, res, next) => {
    req.body.data.timestamp = new Date().getTime();
    io.sockets.to(req.body.id).emit('addRecognize', [req.body.data]);
    res.send({ status: 'OK' });
});

router.post('/classify', (req, res, next) => {
    let API;
    if (api[req.params.id])
        API = api[req.params.id].url + api[req.params.id].endpoint;
    else
        API = AI_VISION_API;

    req.body = req.req.pipe(request.post(API, { strictSSL: false }));

});

app
    .use(mount('/assets', staticServe(path.join(__dirname, 'builtAssets'))))
    .use(mount('/static', staticServe(path.join(__dirname, 'static'))))
    .use(router.routes());

app.listen(port, () => {
    console.log(`Koa run on port ${port}`);
});