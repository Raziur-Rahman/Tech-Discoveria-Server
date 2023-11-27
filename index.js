const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;


// middleware 
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.idotoa5.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Custom middleWare's

const gateman = (req, res, next) => {
    if (!req?.headers?.authorization) {
        return res.status(401).send({ massage: "Unauthorized Access" })
    }
    const token = req?.headers?.authorization.split(' ')[1];
    // console.log("token From middleware: ", token);
    jwt.verify(token, process.env.JWT_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ massage: "Unauthorized Access" })

        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollection = client.db('TechDiscoveriaDB').collection('users');
        const productsCollection = client.db('TechDiscoveriaDB').collection('products');


        // Custom middleWare's
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            const isAdmin = user?.role === "admin";

            if (!isAdmin) {
                return res.status(403).send({ message: "Forbidden access" });

            }
            next();
        }

        // JsonWebToken Api's
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_TOKEN_SECRET, { expiresIn: "1h" })
            res.send({ token })
        })

        // User's Api is here

        app.get('/users', gateman, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/:email', gateman, async (req, res) => {
            const email = req.params.email;
            const query = {
                email: email
            }
            const result = await usersCollection.findOne(query);
            res.send(result?.role);
        })

        app.post('/users', async (req, res) => {
            const user = req.body;

            const query = {
                email: user.email
            }

            const existUser = await usersCollection.findOne(query);
            if (existUser) {
                res.send({ massage: "User Already Exist", insertedId: null })
            }
            else {
                const result = await usersCollection.insertOne(user);
                res.send(result);
            }

        })

        app.patch('/users/:id', gateman, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedObject = {
                $set: {
                    role: data?.role
                }
            }
            const result = await usersCollection.updateOne(filter, updatedObject)
            res.send(result);
        })

        // products related api's

        app.get('/products', async(req, res)=>{
            const result = await productsCollection.find().toArray();
            res.send(result);
        })
        app.get('/products/:id', async(req, res)=>{
            const id = req.params.id;

            const query = {_id: new ObjectId(id)};

            const result = await productsCollection.findOne(query);
            res.send(result);
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send("Tech Discoveria Server is running....");
})
app.listen(port, () => {
    console.log("Discoveria is Running at port: ", port)
})