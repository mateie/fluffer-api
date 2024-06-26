import UserModel from "../schemas/User";
import { validateLogin, validateRegister } from "../Validation";
import bcrypt from "bcrypt";
import { Snowflake } from "@theinternetfolks/snowflake";

import { decrypt, encrypt } from "../struct/Crypt";

const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

export default {
    Mutation: {
        signupUser: async (_: any, { input }: { input: SignupInput }) => {
            const inputEmail = input.email.toLowerCase();
            const inputUsername = input.username.toLowerCase();

            if (emailRegex.test(inputUsername))
                throw new Error("Username cannot be an email");

            const { error, value } = validateRegister.validate({
                email: inputEmail,
                username: inputUsername,
                password: input.password,
                confirmPassword: input.confirmPassword,
                dateOfBirth: input.dateOfBirth
            });

            if (error) throw new Error(error.message);

            const { username, email, password, confirmPassword, dateOfBirth } =
                value;

            if (username === email)
                throw new Error("Username and email cannot be the same");

            const errors = [];

            const userExists = await UserModel.findOne({
                $or: [{ username }, { email }]
            });

            if (userExists) {
                if (userExists.username === username)
                    errors.push("Username is taken");
                if (userExists.email === email)
                    errors.push("Email already exists");
            }

            if (password !== confirmPassword)
                errors.push("Passwords do not match");

            if (errors.length > 0) throw new Error(errors.join(", "));

            const salt = bcrypt.genSaltSync(11);
            const hash = bcrypt.hashSync(password, salt);

            const newPass = encrypt(hash);

            const user = new UserModel({
                id: Snowflake.generate(),
                username,
                email,
                password: newPass,
                dateOfBirth,
                age:
                    new Date().getFullYear() -
                    new Date(dateOfBirth).getFullYear()
            });

            await user.save();

            return true;
        },
        loginUser: async (_: any, { input }: { input: LoginInput }) => {
            const usernameOrEmail = input.usernameOrEmail.toLowerCase();

            if (emailRegex.test(usernameOrEmail)) {
                const { error } = validateLogin.validate({
                    email: usernameOrEmail
                });

                if (error) throw new Error(error.message);
            } else {
                const { error } = validateLogin.validate({
                    username: usernameOrEmail
                });

                if (error) throw new Error(error.message);
            }

            const user = await UserModel.findOne({
                $or: [{ email: usernameOrEmail }, { username: usernameOrEmail }]
            });

            if (!user) throw new Error("User not found");

            const {
                error: passwordError,
                value: { password }
            } = validateLogin.validate({
                password: input.password
            });

            if (passwordError) throw new Error(passwordError.message);

            const pass = bcrypt.compareSync(password, decrypt(user.password));

            if (!pass) throw new Error("Incorrect password");

            const { password: _p, _id: _d, ...rest } = user.toJSON();

            return {
                token: user.generateToken(),
                ...rest
            };
        }
    }
};
