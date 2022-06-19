// importing dependencies and doing other initialisation stuff
const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);

app.use(express.static("public"));
app.use(express.json());

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const SUCCESS = 1,
  FAIL = 0;

// Creating some usufull functions
function generateHash(key) {
  return crypto.createHash("sha3-512").update(key.toString()).digest("hex");
}

function getCodeFrom(packageName) {
  var configData = JSON.parse(
    fs.readFileSync("./packages/" + packageName + "/nebula.conf.json", "utf8")
  );

  var code = ``;
  configData.packages.forEach((package) => {
    code += getCodeFrom(package) + "\n";
  });

  configData.includes.forEach((package) => {
    code += fs.readFileSync("./packages/" + packageName + "/" + package) + "\n";
  });

  code += fs.readFileSync("./packages/" + packageName + "/" + configData.main);
  return code;
}

function getSignatures() {
  return (
    JSON.parse(fs.readFileSync("./packages/signatures.json", "utf8")) || {}
  );
}

function setSignatures(newSignatures) {
  try {
    fs.writeFileSync(
      "./packages/signatures.json",
      JSON.stringify(newSignatures, null, 2)
    );
    return 1;
  } catch (error) {
    return 0;
  }
}

function packageNameAvaileble(name) {
  return !Object.keys(getSignatures()).includes(name);
}

function ensureDirectoryExistence(filePath) {
  var dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

function KeyIsCorrect(key, packageName) {
  var currentSignatures = getSignatures();
  if (
    currentSignatures[packageName] &&
    currentSignatures[packageName] == generateHash(key)
  ) {
    return true;
  } else {
    return false;
  }
}

// use GET http://localhost:3000/packages/aPackageName to fetch the code for a package
app.get("/packages/:packageName", (req, res) => {
  res.send(getCodeFrom(req.params.packageName));
});

/*
-2 repsonse means writing to file failed
-1 response means there already is a package with that name, so you can't claim it
any other response is a key the client has to store locally and send when trying to publish
*/
app.post("/claimpackage/:packageName", (req, res) => {
  var currentSignatures = getSignatures();
  var packageName = req.params.packageName;

  if (!packageNameAvaileble(packageName)) {
    res.send("-1");
  } else {
    var key = Math.round(Math.random() * 1000000000000000);
    var hashedKey = generateHash(key);

    currentSignatures[packageName] = hashedKey;
    var status = setSignatures(currentSignatures);

    if (status == SUCCESS) {
      res.send(key.toString());
    } else {
      res.send("-2");
    }
  }
});

/*
Used for editing your package.
This uses 4 different values stored in different places.

---------------------------
package name    inside the url
package key     inside the header

file name       inside the body
file content    inside the body

------ example usage -------
axios
  .post(
    "http://localhost:3000/editpackage/"+packagename,
    {
      filename: filename,
      filecontent: filecontent
    },
    {
      headers: {
        packagekey: packagekey
      }
    })
    .then((response) => {
      // do something with response.data
    })
    .catch((error) => {
      // do something with the error
    });
*/
app.post("/editpackage/:packageName", (req, res) => {
  var packageName = req.params.packageName;
  var packagekey = req.headers["packagekey"];

  if (KeyIsCorrect(packagekey, packageName)) {
    var filename = req.body.filename;
    var filecontent = req.body.filecontent;

    try {
      var pathToFile = path.join("./packages", packageName, filename);
      ensureDirectoryExistence(pathToFile);
      console.log(pathToFile);
      console.log(filecontent);
      fs.writeFileSync(pathToFile, filecontent);
      res.send("success"); // successfull
    } catch (error) {
      console.log(error);
      res.send("err:file"); // there was an error writing the file
    }
  } else {
    res.send("err:unauth"); // the package name and package key do not match and the request is therefor unauthorized
  }
});

// use GET http://localhost:3000/preview/aPackageName to preview a package
app.get("/preview/:packageName", (req, res) => {
  res.send(
    fs.readFileSync(
      "./packages/" + req.params.packageName + "/README.md",
      "utf8"
    ) || `# ${req.params.packageName}`
  );
});

// use GET http://localhost:3000/search/aSearchTerm to show all packages wich include the search term
app.get("/search/:searchTerm", (req, res) => {
  var searchTerm = req.params.searchTerm;
  var titles = Object.keys(getSignatures());
  var results = titles.filter((title) =>
    title.toLowerCase().includes(searchTerm.toLowerCase())
  );
  res.send(results.join("\n"));
});

// start the server
let port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("listening on port " + port);
});
