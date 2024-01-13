const express = require('express')
const mongoose = require('mongoose')
const User = require('../models/user')
const House = require('../models/house')
const jwt = require('jsonwebtoken')
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');


const router = express.Router()

const db = 'mongodb://localhost:27017/real';

const IncomingForm = require('formidable').IncomingForm
var ObjectId = require('mongodb').ObjectId;


mongoose.connect(db, function (err) {
    if (err) {
        console.log(err)
    }
    else {
        console.log("Connected to MongoDB")
    }
})


function verifyToken(req, res, next) {
    if (!req.headers.authorization) {
        return res.status(401).send('Unauthorized Request')
    }
    let token = req.headers.authorization.split(' ')[1]
    if (token == null) {
        return res.status(401).send('Unauthorized Request')
    }
    let payload = jwt.verify(token, 'secretKey')
    if (!payload) {
        return res.status(401).send('Unauthorized Request')
    }

    req.userId = payload.subject
    next()
}

router.get('/', function (req, res) {
    res.end("hello")
})


router.post('/register', function (req, res) {
    let userData = req.body;

    User.findOne({ $or: [{ email: userData.email }, { username: userData.username }] }, function (err, existingUser) {
        if (err) {
            console.log(err);
            res.status(500).send('Internal Server Error');
        } else {
            if (existingUser) {
                if (existingUser.email === userData.email) {
                    res.status(400).send('Email already exists');
                } else if (existingUser.username === userData.username) {
                    res.status(400).send('Username already exists');
                }
            } else {
                bcrypt.hash(userData.password, 10, function (err, hash) {
                    if (err) {
                        console.log(err);
                        res.status(500).send('Failed to hash password');
                    } else {
                        userData.password = hash; 
                        let user = new User(userData);
                        user.save(function (err, registeredUser) {
                            if (err) {
                                console.log(err);
                                res.status(500).send('Failed to register user');
                            } else {
                                let payload = { subject: registeredUser._id };
                                let token = jwt.sign(payload, 'secretKey');
                                res.status(200).send({ token, registeredUser });
                            }
                        });
                    }
                });
            }
        }
    });
});

router.post('/login', function (req, res) {
  let userData = req.body;

  User.findOne({ email: userData.email }, function (err, user) {
    if (err) {
      console.log(err);
      res.status(500).send('Internal Server Error');
    } else {
      if (!user) {
        res.status(401).send('Invalid email or password');
      } else {
        bcrypt.compare(userData.password, user.password, function (err, result) {
          if (err) {
            console.log(err);
            res.status(500).send('Internal Server Error');
          } else {
            if (result) {
              let payload = { subject: user._id, isAdmin: user.isAdmin , exp: Math.floor(Date.now() / 1000) + 60 * 60,}; // Include isAdmin in the payload
              let token = jwt.sign(payload, 'secretKey');
              res.status(200).send({ token, user });
            } else {
              res.status(401).send('Invalid email or password');
            }
          }
        });
      }
    }
  });
});

router.post('/addhouse', verifyToken, (req, res) => {
  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form:', err);
      return res.status(500).json({ error: 'Error parsing form data' });
    }

    try {
      const {
        title,
        description,
        price,
        location,
        bedrooms,
        bathrooms,
        size,
        amenities,
        category,
        type
      } = fields;

      if (!title || !description || !price || !location || !bedrooms || !bathrooms || !size || !amenities || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const house = new House({
        title,
        description,
        price,
        location,
        bedrooms,
        bathrooms,
        size,
        amenities: JSON.parse(amenities),
        category,
        type,
        postedBy: req.userId,
        images: [] 
      });

      const fileKeys = Object.keys(files); 

      for (let i = 0; i < fileKeys.length; i++) {
        const fileKey = fileKeys[i];
        const file = files[fileKey];
        const oldPath = file.path;
        const newPath = path.join(__dirname, '..', 'uploads', file.name);
      
        try {
          await fs.promises.rename(oldPath, newPath); 
          house.images.push(newPath); 
        } catch (renameError) {
          console.error('Error renaming file:', renameError);
          return res.status(500).json({ error: 'Error renaming files' });
        }
      }
      await house.save();
      console.log(house.images);
      res.status(201).json({ message: 'House added successfully' });
    } catch (error) {
      console.error('Error adding house:', error);
      res.status(500).json({ error: 'Error adding house' });
    }
  });
});

  router.get('/houses', async (req, res) => {
    try {
      const houses = await House.find({});
      const housesWithModifiedImages = houses.map((house) => {
        return {
          ...house._doc,
          images: house.images.map((image) => {

            const imageFilename = image.split('\\').pop();
            const fullImagePath = `/uploads/${imageFilename}`;
            return fullImagePath;
          }),
        };
      });
      res.status(200).json({ houses: housesWithModifiedImages });
    } catch (error) {
      console.error('Error retrieving houses:', error);
      res.status(500).json({ error: 'Error retrieving houses' });
    }
  });
  router.post('/uploadUserImage', verifyToken, (req, res) => {
    const form = new formidable.IncomingForm(); 
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Error parsing form:', err);
        return res.status(500).json({ error: 'Error parsing form data' });
      }
  
      try {
        const { userId } = req;
        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
  
        const user = await User.findById(userId);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
  
        const { userImage } = files;
  
        if (!userImage) {
          return res.status(400).json({ error: 'No image uploaded' });
        }
  
        const oldPath = userImage.path;
        const newPath = path.join(__dirname, '..', 'uploads','users', userImage.name);
  
        await fs.promises.rename(oldPath, newPath); 
  
        user.userImage = newPath; 
        await user.save();
  
        res.status(200).json({ message: 'User image uploaded successfully', imagePath: newPath });
      } catch (error) {
        console.error('Error uploading user image:', error);
        res.status(500).json({ error: 'Error uploading user image' });
      }
    });
  });
  router.get('/getUserDetails/:userId', verifyToken, async (req, res) => {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      let imageUrl = null;
      if (user.userImage) {
        const imageFilename = user.userImage.split('\\').pop();
        user.userImage = `/uploads/users/${imageFilename}`;
        console.log(user.userImage);
      }
      res.status(200).json({ user: { ...user._doc, imageUrl } });
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({ error: 'Error fetching user details' });
    }
  });

router.put('/updateUser/:userId', verifyToken, async (req, res) => {
  try {
    const userId = req.params.userId;
    const updatedDetails = req.body;

    const user = await User.findByIdAndUpdate(userId, updatedDetails, { new: true });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({ message: 'User details updated successfully', user });
  } catch (error) {
    console.error('Error updating user details:', error);
    res.status(500).json({ error: 'Error updating user details' });
  }
});
router.get('/house/:id', async (req, res) => {
  try {
    const houseId = req.params.id;

    const house = await House.findById(houseId);

    if (!house) {
      return res.status(404).json({ error: 'House not found' });
    }

    const houseWithModifiedImages = {
      ...house._doc, 
      images: house.images.map((image) => {
        const imageFilename = image.split('\\').pop(); 
        const fullImagePath = `/uploads/${imageFilename}`;
        return fullImagePath;
      }),
    };

    res.status(200).json({ house: houseWithModifiedImages });
  } catch (error) {
    console.error('Error retrieving house details:', error);
    res.status(500).json({ error: 'Error retrieving house details' });
  }
});

router.put('/updateHouse/:id', verifyToken, async (req, res) => {
  try {
    const houseId = req.params.id;
    const updatedDetails = req.body; 
    const house = await House.findByIdAndUpdate(
      houseId,
      {
        $set: {
          title: updatedDetails.title,
          description: updatedDetails.description,
          price: updatedDetails.price,
          location: updatedDetails.location,
          bedrooms: updatedDetails.bedrooms,
          bathrooms: updatedDetails.bathrooms,
          size: updatedDetails.size,
          category: updatedDetails.category,
          type: updatedDetails.type,
          amenities: updatedDetails.amenities
        }
      },
      { new: true }
    );

    if (!house) {
      return res.status(404).json({ error: 'House not found' });
    }

    res.status(200).json({ message: 'House details updated successfully', house });
  } catch (error) {
    console.error('Error updating house details:', error);
    res.status(500).json({ error: 'Error updating house details' });
  }
});

router.put('/updateHouseImages/:id', verifyToken, (req, res) => {
  console.log('hello');
  const form = new formidable.IncomingForm();
  console.log('hello');

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form:', err);
      return res.status(500).json({ error: 'Error parsing form data' });
    }

    try {
      const houseId = req.params.id;
      console.log(houseId);

      const house = await House.findById(houseId);
      
      if (!house) {
        return res.status(404).json({ error: 'House not found' });
      }

      house.images = [];

      const fileKeys = Object.keys(files);

      for (let i = 0; i < fileKeys.length; i++) {
        const fileKey = fileKeys[i];
        const file = files[fileKey];
        const oldPath = file.path;
        const newPath = path.join(__dirname, '..', 'uploads', file.name);

        try {
          await fs.promises.rename(oldPath, newPath);
          house.images.push(newPath);
        } catch (renameError) {
          console.error('Error renaming file:', renameError);
          return res.status(500).json({ error: 'Error renaming files' });
        }
      }

      await house.save();
      res.status(200).json({ message: 'House images updated successfully', house });
    } catch (error) {
      console.error('Error updating house images:', error);
      res.status(500).json({ error: 'Error updating house images' });
    }
  });
});
router.get('/users', verifyToken, async (req, res) => {
  try {
    const users = await User.find({});

    res.status(200).json({ users });
  } catch (error) {
    console.error('Error retrieving users:', error);
    res.status(500).json({ error: 'Error retrieving users' });
  }
});

router.delete('/users/:userId', verifyToken, async (req, res) => {
  try {
    const userId = req.params.userId;

    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'User deleted successfully', deletedUser });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Error deleting user' });
  }
});

router.delete('/deletehouse/:id', verifyToken, async (req, res) => {
  try {
    const houseId = req.params.id;

    const deletedHouse = await House.findByIdAndDelete(houseId);

    if (!deletedHouse) {
      return res.status(404).json({ error: 'House not found' });
    }

    res.status(200).json({ message: 'House deleted successfully', deletedHouse });
  } catch (error) {
    console.error('Error deleting house:', error);
    res.status(500).json({ error: 'Error deleting house' });
  }
});

  
module.exports = router;