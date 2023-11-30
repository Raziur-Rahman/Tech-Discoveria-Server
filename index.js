const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const stripe = require("stripe")(`${process.env.STRIPE_SECRET_KEY}`);
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;


// middleware 
app.use(cors());
app.use(express.json());
app.use(express.static("public"));


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
        const paymentsCollection = client.db('TechDiscoveriaDB').collection('payments');

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
            const token = jwt.sign(user, process.env.JWT_TOKEN_SECRET, { expiresIn: "6hr" })
            res.send({ token })
        })

        // User's Api is here

        app.get('/users', gateman, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/role/:email', gateman, async (req, res) => {
            const email = req.params.email;
            const query = {
                email: email
            }
            const result = await usersCollection.findOne(query);
            res.send(result?.role);
        })

        app.get('/users/:email', gateman, async (req, res) => {
            const email = req.params.email;
            const query = {
                email: email
            }
            const result = await usersCollection.findOne(query);
            res.send(result);
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

        app.patch('/users/:email', async (req, res) => {
            const email = req.params.email;
            const data = req.body;
            console.log(email, data);
            const filter = { email: email }
            const updatedDoc = {
                $set: {
                    Membership: data.Membership
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);

            res.send(result);

        })

        // Products Related Api's here
        // User Products api's
        app.post('/userProducts', gateman, async (req, res) => {
            const product = req.body;
            const result = await productsCollection.insertOne(product);
            res.send(result);
        })

        app.get('/userProducts/:email', gateman, async (req, res) => {
            const email = req.params.email;
            const filter = {
                ownerEmail: email
            }
            const result = await productsCollection.find(filter).toArray();
            res.send(result);
        })

        app.get('/userProducts', async (req, res) => {



            const query = req.query;
            let result = [];

            if (query?.category) {
                result = await productsCollection.find(query).toArray();
            }
            else {
                result = await productsCollection.aggregate([
                    {
                        $project: {
                            originalDoc: '$$ROOT',
                            customSortField: {
                                $cond: {
                                    if: { $eq: ['$status', 'pending'] },
                                    then: 1,
                                    else: 2
                                }
                            }
                        }
                    },
                    {
                        $sort: { customSortField: 1 }
                    },
                    {
                        $project: {
                            originalDoc: 1,
                            _id: 0
                        }
                    }
                ]).toArray();
            }
            res.send(result);
        })

        app.put('/userProducts/:id', gateman, async (req, res) => {
            const bodyDoc = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true }

            const updatedDoc = {
                $set: { ...bodyDoc }
            }

            const result = await productsCollection.updateOne(filter, updatedDoc, options);

            res.send(result);
        })

        app.delete("/userProducts/:id", gateman, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await productsCollection.deleteOne(query);
            res.send(result);
        })


        // products api's
        app.get('/page/products', async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const filter = {
                status: " Accepted" 
            }
            
            const result = await productsCollection.find(filter).skip(page * size).limit(size).toArray();
            res.send(result);
        })

        app.get('/productsCount', async (req, res) => {
            const filter = {
                status: " Accepted" 
            }
            const result = await productsCollection.find(filter).toArray();
            const count = result?.length;
            res.send({ count });
        })

        app.get('/products', async (req, res) => {
            const query = req.query;

            let result = [];

            if (query?.category === "Featured") {
                result = await productsCollection.find(query).sort({ timestamp: -1 }).toArray();
                return res.send(result);
            }
            else if (query?.category === "Trending") {
                result = await productsCollection.find(query).sort({ upvotes: -1 }).toArray();
                return res.send(result);
            }

        })
        app.get('/products/:id', gateman, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await productsCollection.findOne(query);
            res.send(result);
        })
        app.patch('/products/:id', gateman, async (req, res) => {
            const id = req.params.id;
            const bodyData = req.body;
            const filter = { _id: new ObjectId(id) };

            const { key, ...rest } = bodyData;

            let updatedDoc = {
                $set: { ...rest }
            };
            // console.log(id, key, rest, updatedDoc);
            const result = await productsCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // Payment's Related Api's
        app.post('/create_payment_intent', async (req, res) => {
            const { price } = req.body;

            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card'],
            })

            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        })

        app.post('/payments', gateman, async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);

            const email = req.decoded.email;

            const filter = { email: email }
            const updatedDoc = {
                $set: {
                    Membership: "Subscribed"
                }
            }
            const userUpdate = await usersCollection.updateOne(filter, updatedDoc);

            res.send({ result, userUpdate });

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