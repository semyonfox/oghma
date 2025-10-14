/*This file's role is to let every component know whether a user is logged in
 instead of passing down props or updating pages manually*/

import {createContext, useState} from "react";

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [auth, setAuth] = useState({});

    return (
        <AuthContext.Provider value={[auth, setAuth]}>
            {children}
        </AuthContext.Provider>
    )
}

export default AuthContext;
