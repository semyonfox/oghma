'use client'
import axios from '../api/axios';
import {useRef, useState, useEffect, useContext} from 'react';
import AuthContext from '@/context/AuthProvider';


const Page = () => {
    const {setAuth} = useContext(AuthContext);
    const userRef = useRef(null);
    const errRef = useRef(null);

    const[user, setUser] = useState(''); /*four states of the page*/
    const[pwd, setPwd] = useState('');
    const[errMsg, setErrMsg] = useState('');
    const[success, setSuccess] = useState(false);

    useEffect(() => {
        userRef.current.focus();
    }, [])

    useEffect(() => {
        setErrMsg('');
    }, [user, pwd]) /*clear out any errors for next attempt*/

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post(LOGIN_URL,
                JSON.stringify({user,pwd}),
                {
                    headers: {'Content-Type': 'application/json'},
                    withCredentials: true
                }
            );
            console.log(JSON.stringify(response?.data));
            const accessToken = response?.data?.accessToken; //optional chaining
            const roles = response?.data?.roles;
            setUser(''); //refreshing the login
            setPwd('');
            setSuccess(true); //letting the person into the web app
        } catch (err) { //error cases for the login
            if (!err?.response) {
                setErrMsg('No Server Response');
            } else if (err.response?.status === 400) {
                setErrMsg('Missing Username or Password');
            } else if (err.response?.status === 401) {
                setErrMsg('Unauthorized');
            } else {
                setErrMsg('Login Failed');
            }
            errRef.current.focus();
        }
    }
    return (
        <>
            {success ? (
                <section>
                    <h1>You are logged in!</h1>
                    <br />
                    <p>
                        <a href="#">Go to Home</a>
                    </p>
                </section>
            ) : (
        <section>
            <AuthContext />
            <p ref={errRef} className={errMsg ? "errMsg" : "offscreen"} aria-live="assertive">{errMsg}</p>
            <h1>Sign in</h1>
            <form onSubmit={handleSubmit}>
                <label htmlFor="username">Username:</label>
                <input type="text"
                   id ="username"
                   ref={userRef}
                   autoComplete="off"
                   onChange={(e) => setUser(e.target.value)}
                   value={user}
                   required
                />

                <label htmlFor="password">Password:</label>
                <input
                    type="password"
                    id="password"
                    onChange={(e) => setPwd(e.target.value)}
                    value={pwd}
                    required
                />
                <button>Sign in</button>
            </form>
            <p>
                Need a Account?<br />
                <span className="line">
                    {/*router link*/}
                    <a href="#">Sign Up</a>
                </span>
            </p>
        </section>
            )}
        </>
    )
}

export default Page;