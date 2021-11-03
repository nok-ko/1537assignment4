const express = require('express');
const fs = require("fs");

const app = express();

const port = 8080;

app.use('/', express.static('dist'));

// Go to: http://localhost:8000
app.get('/', function (req, res) {
    let doc = fs.readFileSync('./dist/html/main.html', "utf8");
    res.send(doc);
});


app.get('/saves/', (req, res) => {
    let saves = []
    fs.readdirSync('./saves').forEach((name) => {
        saves.push(fs.readFileSync('./saves/' + name, {encoding: "utf8"}))
    })
    console.log(saves)

    res.send(JSON.stringify(saves))
});

app.post('/saves/', (req, res) => {
    console.log(req.body)
    // TODO: actually save the stuff we get
    // res.send(JSON.stringify(saves))
    // res.code = 200
    res.send("Got save file!")
});

app.use((req, res) => {
    res.status(404).send("Nothing there, 404");
})

// Run the server!
app.listen(port, () => console.log(`App running at http://127.0.0.1:${port} !`));