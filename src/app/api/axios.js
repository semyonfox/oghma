/*
* Taken from Dave Gray's "React Login Authentication with JWT Access, Refresh Tokens, Cookies and Axios"
* youtube tutorial for creating a private axios instance*/
import axios from 'axios';

export default axios.create({
    baseURL: 'http://localhost:3000',
})