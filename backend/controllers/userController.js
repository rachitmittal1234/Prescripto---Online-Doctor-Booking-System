import validator from "validator";
import bcrypt from "bcrypt";
import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";
import {v2 as cloudinary} from 'cloudinary';
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";


//API to register user..
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !password || !email) {
      return res.json({ success: false, message: "Missing Details!!" });
    }

    if (!validator.isEmail(email)) {
      return res.json({ success: false, message: "Enter a Valid Email!!" });
    }

    if (password.length < 8) {
      return res.json({ success: false, message: "Enter a Strong Password!!" });
    }

    // Hashing user password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      name,
      email,
      password: hashedPassword,
    };

    const newUser = new userModel(userData);
    const user = await newUser.save();

    // _id
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    return res.json({ success: true, token });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};

// API for user login

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });

    if (!user) {
      res.json({ success: false, message: "User does not exists." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      return res.json({ success: true, token });
    } else {
      return res.json({ success: false, message: "Invalid Credentials!" });
    }
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};

//Api to get user profile data

const getProfile = async (req, res) => {
  try {
    // const {userId}=req.body;
    const userId = req.userId;
    const userData = await userModel.findById(userId).select("-password");

    return res.json({ success: true, userData });
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};

// APi to update user Profile
const updateProfile = async (req, res) => {
  try {
    const {name, phone, address, dob, gender } = req.body;
    const userId = req.userId;
    const imageFile = req.file;

    if (!name || !phone || !dob || !gender) {
      return res.json({ success: false, message: "Data Missing!!" });
    }
    await userModel.findByIdAndUpdate(userId, {
      name,
      phone,
      address: JSON.parse(address),
      dob,
      gender
    },{ new: true });

    if(imageFile){
        //upload image to cloudinary....
        const imageUpload=await cloudinary.uploader.upload(imageFile.path,{resource_type:'image'});
        const imageURL=imageUpload.secure_url;

        await userModel.findByIdAndUpdate(userId,{image: imageURL});
    }

    res.json({success:true,message:"Profile Updated!!"});


  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
  }
};

// Api to Book Appointment...
const bookAppointment=async (req,res)=>{
  try {
    const { docId, slotDate, slotTime } = req.body;
    const userId = req.userId;

    const docData=await doctorModel.findById(docId).select('-password');

    if(!docData.available){
      return res.json({success:false,message:'Doctor not Available!!'});
    }

    let slots_booked=docData.slots_booked;

    //Checking for slots Availability...
    if(slots_booked[slotDate]){
      if(slots_booked[slotDate].includes(slotTime)){
        return res.json({success:false,message:'Slot not Available!!'});
      }
      else{
        slots_booked[slotDate].push(slotTime);
      }
    }
    else{
      slots_booked[slotDate]=[];
      slots_booked[slotDate].push(slotTime);
    }

    const userData=await userModel.findById(userId).select('-password');

    delete docData.slots_booked;

    const appointmentData={
      userId,
      docId,
      userData,
      docData,
      amount:docData.fees,
      slotTime,
      slotDate,
      date:Date.now()
    }

    const newAppointment=new appointmentModel(appointmentData);
    await newAppointment.save();

    // Save new Slots Data in docData
    await doctorModel.findByIdAndUpdate(docId,{slots_booked});

    return res.json({success:true,message:'Appointment Booked!!'});

  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
    
  }
}

// Api to get user appointments for frontend my-appointments page...
const listAppointment = async (req,res)=>{
  try {
    const userId=req.userId;
    const appointments=await appointmentModel.find({userId});
    
    res.json({success:true,appointments});
  } catch (error) {
    console.log(error);
    return res.json({ success: false, message: error.message });
    
  }
}

// Api to cancel Appointment..
const cancelAppointment=async (req,res)=>{
  try {
    const userId=req.userId;
    const {appointmentId}=req.body;

    const appointmentData=await appointmentModel.findById(appointmentId);

    // Verify Appointment User...
    if(appointmentData.userId !== userId)
    {
      return res.json({success:false,message:"Unauthorized Action!!"});
    }

    await appointmentModel.findByIdAndUpdate(appointmentId,{cancelled:true});

    // relaeasing doctor Slot...

    const {docId,slotDate,slotTime}=appointmentData;

    const doctorData=await doctorModel.findById(docId);

    let slots_booked=doctorData.slots_booked;

    if (!Array.isArray(slots_booked[slotDate])) {
      slots_booked[slotDate] = [];
    }

    slots_booked[slotDate]=slots_booked[slotDate].filter((e) => e!== slotTime);

    await doctorModel.findByIdAndUpdate(docId,{slots_booked});

    res.json({success:true,message:"Appointment Cancelled!!"});

    } catch (error) {
      console.log(error);
      return res.json({ success: false, message: error.message });
    }
  }

export { registerUser, loginUser, getProfile,updateProfile,bookAppointment,listAppointment,cancelAppointment };
