import React, {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {
    FunctionTypeLoginDataToVoid, messageValidatorFullName,
    messageValidatorUserName, messageValidatorUserPassword,
    nicknameValidate,
    fullNameValidate,
    passwordValidate
} from "../layout/Auth/Auth";
import {UserData} from "../QBHeplers";
import './SignUp.scss';

type SignUpProps = {
    signUpHandler?: FunctionTypeLoginDataToVoid;
    errorMessage?: string;
    isOnline: boolean;
};

const SignUp: React.FC<SignUpProps> = ({signUpHandler, errorMessage, isOnline}: SignUpProps) => {
    document.title = 'Login';
    const [userName, setUserName] = useState('');
    const [fullName, setFullName] = useState('');
    const [userPassword, setUserPassword] = useState('');
    const [validInputValues, setValidInputValues] = useState(false);
    const [validValue, setValidValue] = useState(
        {
            userName: {isTouched: false, isNotValid: true},
            fullName: {isTouched: false, isNotValid: true},
            userPassword: {isTouched: false, isNotValid: true}
        }
    );


    useEffect(() => {
        setValidInputValues(
            !validValue.userName.isNotValid && validValue.userName.isTouched
            &&
            !validValue.fullName.isNotValid && validValue.fullName.isTouched
            &&
            !validValue.userPassword.isNotValid && validValue.userPassword.isTouched
        );
    }, [validValue]);


    const submitForm = (event: React.SyntheticEvent) => {
        event.preventDefault();
        const data: UserData = {
            login: userName,
            password: userPassword,
            fullName: fullName,
        };

        if (signUpHandler) {
            signUpHandler(data);
        }
    };

    return (
        <div className="container">
            <div className="login-form">
                <div className="login-form-title">
                    <h3>QB UIKit React Sample</h3>
                    <h2>Sign up</h2>
                    <p>Already have an account?
                        <Link to='/sign-in'>
                            {" Sign In"}
                        </Link>
                    </p>
                </div>
                <form onSubmit={submitForm}>
                    <div className="login-form-content">
                        <input
                            type="text"
                            onChange={(e) => {
                                const value = e.target.value;
                                setUserName(value);
                                const validValueUserName = {...validValue.userName};
                                validValueUserName.isNotValid = !nicknameValidate(value);
                                setValidValue({...validValue, userName: validValueUserName})
                            }}
                            onFocus={() => setValidValue({
                                ...validValue,
                                userName: {...validValue.userName, isTouched: true}
                            })}
                            value={userName}
                            placeholder="User name"
                            id="userName"
                        />
                        {
                            validValue.userName.isTouched && validValue.userName.isNotValid
                                ?
                                <p className="error">{messageValidatorUserName}</p>
                                :
                                null
                        }

                        <input
                            type="text"
                            onChange={(e) => {
                                const value = e.target.value;
                                setFullName(value);
                                const validValueFullName = {...validValue.fullName};
                                validValueFullName.isNotValid = !fullNameValidate(value);
                                setValidValue({...validValue, fullName: validValueFullName})
                            }}
                            onFocus={() => setValidValue({
                                ...validValue,
                                fullName: {...validValue.fullName, isTouched: true}
                            })}
                            value={fullName}
                            placeholder="Full Name"
                            id="fullName"
                        />
                        {
                            validValue.fullName.isTouched && validValue.fullName.isNotValid
                                ?
                                <p className="error">{messageValidatorFullName}</p>
                                :
                                null
                        }

                        <input
                            type="password"
                            onChange={(e) => {
                                const value = e.target.value;
                                setUserPassword(value);
                                const validValueUserPassword = {...validValue.userPassword};
                                validValueUserPassword.isNotValid = !passwordValidate(value);
                                setValidValue({...validValue, userPassword: validValueUserPassword})
                            }}
                            onFocus={() => setValidValue({
                                ...validValue,
                                userPassword: {...validValue.userPassword, isTouched: true}
                            })}
                            value={userPassword}
                            placeholder="Password"
                            id="userPassword"
                        />

                        {
                            validValue.userPassword.isTouched && validValue.userPassword.isNotValid
                                ?
                                <p className="error">{messageValidatorUserPassword}</p>
                                :
                                null
                        }

                    </div>
                    <div className="login-form-btn">
                        <button
                            title="Sign Up"
                            type="submit"
                            disabled={!validInputValues || !isOnline}>
                            Sign Up
                        </button>
                        {errorMessage || !isOnline
                            ?
                            <p className="error">
                                {errorMessage}
                            </p>

                            :
                            null
                        }
                    </div>
                </form>
            </div>
        </div>
    );
}

export default SignUp;
