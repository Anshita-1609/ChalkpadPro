const express = require('express');
const app = express();
const session = require('express-session');
const mongodb = require('mongodb');
const client = mongodb.MongoClient;
const object = mongodb.ObjectId;
let dbinstance;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "abc",
    saveUninitialized: true,
    resave: false
}));
app.use(express.json());
app.use(express.static(__dirname + "/public"));

function authentication(req, res, next) {
    if (req.session.loggedin)
        next();
    else
        res.redirect("/login");
}

function authorization(req, res, next) {
    if (req.session.loggedin && req.session.userData.role === "staff")
        next();
    else
        res.redirect("/");
}
client.connect('mongodb://127.0.0.1:27017').then(database => {
    console.log("Connected");
    dbinstance = database.db("ChalkPad");
}).catch(err => {
    console.log(err);
})
app.get("/", authentication, async (req, res) => {
    try {
        const circulars = await dbinstance.collection("circulars").find().toArray();
        const role = req.session.userData.role;
        const username = req.session.userData.username;
        res.render('home', { role, circulars, u: username });
    } catch (err) {
        console.error("Error fetching circulars:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.get("/login", (req, res) => {
    if (req.session.loggedin) {
        res.redirect("/");
    } else {
        res.render("login");
    }
})

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    dbinstance.collection("users").findOne({ username, password }).then((data) => {
        if (data) {
            req.session.loggedin = true;
            req.session.userData = {
                username, role: data.role,
            }
            res.redirect("/");
        } else {
            res.send("Invalid Details Try again..");
        }
    }).catch((err) => {
        console.log("Error in finding the user in the database");
    })
})

app.get('/header', (req, res) => {
    res.render('header', { u: req.session.userData.username });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get("/changePassword", (req, res) => {
    const username = req.session.userData.username;
    res.render('changePass', { u: username });
})
app.post("/changePassword", authentication, (req, res) => {
    const { username } = req.session.userData;
    const { oldPassword, newPassword } = req.body;

    dbinstance.collection("users").findOne({ username, password: oldPassword }).then((user) => {
        if (user) {
            dbinstance.collection("users").updateOne(
                { username: username },
                { $set: { password: newPassword } }
            ).then(() => {
                res.send("Password updated successfully.");
            }).catch((err) => {
                console.log("Error in updating the password:", err);
                res.send("An error occurred while updating the password.");
            });
        } else {
            res.send("Old password is incorrect.");
        }
    }).catch((err) => {
        console.log("Error in finding the user:", err);
        res.send("An error occurred. Please try again later.");
    });
});


app.get('/imageG', (req, res) => {
    res.render("imageG");
})

app.get("/info", authentication, (req, res) => {
    const username = req.session.userData.username;
    dbinstance.collection("info").findOne({ username }).then((userDetails) => {
        if (userDetails) {
            res.render('info', { user: userDetails, u: username });
        } else {
            res.send("User information not found.");
        }
    }).catch((err) => {
        console.log("Error in finding user details", err);
        res.send("Error fetching user details.");
    });
});

app.get("/perform", authentication, (req, res) => {
    const username = req.session.userData.username;
    const semesters = ["sem1", "sem2"];

    const fetchSemesterData = semesters.map(sem => {
        return dbinstance.collection(sem).find({ username }).toArray();
    });

    Promise.all(fetchSemesterData).then(results => {
        const performance = results.map((semData, index) => ({
            semester: `Semester ${index + 1}`,
            subjects: semData
        }));

        res.render('perform', { performance, u: username });
    }).catch(err => {
        console.log("Error in finding performance details", err);
        res.send("Error fetching performance details.");
    });
});

app.get("/comm", authentication, async (req, res) => {
    const circulars = await dbinstance.collection("circulars").find().toArray();
    if (circulars) {
        console.log(circulars);
    }
    else console.log("No circulars");
    const username = req.session.userData.username;
    res.render('comm', { circulars: circulars, u: username });
});


app.get('/circular/:id', authentication, async (req, res) => {
    try {
        const username = req.session.userData.username;
        const circular = await dbinstance.collection("circulars").findOne({ _id: new object(req.params.id) });
        if (circular) {
            res.render('circular', { circular, u: username });
        } else {
            res.status(404).send("Circular not found");
        }
    } catch (err) {
        console.error("Error fetching circular:", err);
        res.status(500).send("Internal Server Error");
    }
});


app.get('/apply-gate-pass', authentication, (req, res) => {
    res.render('apply-gate-pass');
});
app.post('/apply-gate-pass', (req, res) => {
    const { date, time } = req.body;
    const newGatePass = { date: new Date(date), time };
    dbinstance.collection('gatePass').insertOne(newGatePass)
        .then(result => {
            res.redirect('/');
        })
        .catch(error => {
            console.error(error);
            res.status(500).send('Error applying for gate pass.');
        });
});

app.get('/apply-new-request', authentication, (req, res) => {
    res.render('apply-new-request');
});
app.post('/apply-new-request', (req, res) => {
    const { requestTitle, requestContent } = req.body;
    const newRequest = { title: requestTitle, content: requestContent, date: new Date() };
    dbinstance.collection('request').insertOne(newRequest)
        .then(result => {
            console.log(`New request submitted: ${requestTitle}`);
            res.redirect('/');  // Redirect to a suitable page after submitting the request
        })
        .catch(error => {
            console.error(error);
            res.status(500).send('Error submitting request.');
        });
});

app.get('/view-resources', (req, res) => {
    dbinstance.collection('resources').find().toArray()
        .then(resources => {
            res.render('view-resources', { resources, role: req.role });
        })
        .catch(error => {
            console.error(error);
            res.status(500).send('Error retrieving resources.');
        });
});

app.get('/add-resources', (req, res) => {
    if (req.role === 'staff') {
        res.render('add-resources');
    } else {
        res.status(403).send('Forbidden');
    }
});

app.post('/add-resources', (req, res) => {
    if (req.role === 'staff') {
        const { title, description, url } = req.body;
        const newResource = {
            title, description, url, date: new Date()
        };
        dbinstance.collection('resources').insertOne(newResource)
            .then(result => {
                console.log(`New resource added: ${title}`);
                res.redirect('/view-resources');
            })
            .catch(error => {
                console.error(error);
                res.status(500).send('Error adding resource.');
            });
    } else {
        res.status(403).send('Forbidden');
    }
});

app.get('/reappear-receipt', authentication, (req, res) => {
    res.render('reappear-receipt');
});

app.get('/view-planner', authentication, (req, res) => {
    res.render('view-planner');
});

app.get('/fix-appointment', authentication, (req, res) => {
    res.render('fix-appointment');
});
app.post('/fix-appointment', (req, res) => {
    const { staffName, date, time } = req.body;
    const newAppointment = { staffName, date: new Date(date), time };
    dbinstance.collection('appointment').insertOne(newAppointment)
        .then(result => {
            console.log(`Appointment fixed with ${staffName} on ${date} at ${time}`);
            res.redirect('/');
        })
        .catch(error => {
            console.error(error);
            res.status(500).send('Error fixing appointment.');
        });
});

app.get('/view-custom-page', authentication, (req, res) => {
    res.render('view-custom-page');
});

app.get('/message-inbox', authentication, (req, res) => {
    res.render('message-inbox');
});

app.get('/takeAttendance', authentication, (req, res) => {
    res.render('takeAttendance');
});

app.get('/uploadCircular', (req, res) => {
    res.render('uploadCircular');
});
app.post('/uploadCircular', (req, res) => {
    const { title, content } = req.body;
    const newCircular = { title, content };
    dbinstance.collection('circulars').insertOne(newCircular)
        .then(result => {
            res.redirect('/comm');
        })
        .catch(error => {
            console.error(error);
            res.status(500).send('Error uploading circular.');
        });
});

app.get('/uploadResult', authentication, (req, res) => {
    res.render('uploadResult');
});

app.post('/uploadResult', (req, res) => {
    const { semester, studentId, subjects } = req.body;
    const newResult = {
        studentId,
        subjects: subjects.map(subject => ({
            name: subject.name,
            marks: parseInt(subject.marks, 100),
            grade: subject.grade
        }))
    };
    dbinstance.collection(semester).insertOne(newResult)
        .then(result => {
            res.redirect('/comm');
        })
        .catch(error => {
            console.error(error);
            res.status(500).send('Error uploading result.');
        });
});

app.listen(3000, err => {
    if (err) console.log(err);
    else console.log("server is running at 3000");
})