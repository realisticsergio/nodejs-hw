import { Session } from '../models/session.js';
import bcrypt from 'bcrypt';
import createHttpError from 'http-errors';
import { User } from '../models/user.js';
import { createSession, setSessionCookies } from '../services/auth.js';

import jwt from 'jsonwebtoken';
import Handlebars from 'handlebars';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { sendEmail } from '../utils/sendMail.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resetPasswordTemplatePath = path.join(
  __dirname,
  '../templates/reset-password-email.html',
);

export const requestResetEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        message: 'Password reset email sent successfully',
      });
    }

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '15m',
      },
    );

    const templateSource = await readFile(resetPasswordTemplatePath, 'utf-8');

    const template = Handlebars.compile(templateSource);

    const resetLink =
      `${process.env.FRONTEND_DOMAIN}/reset-password` +
      `?token=${encodeURIComponent(token)}`;

    const html = template({
      name: user.username || user.email,
      resetLink,
    });

    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your password',
        html,
      });
    } catch (error) {
      console.error('SMTP error:', error);

      throw createHttpError(
        500,
        'Failed to send the email, please try again later.',
      );
    }

    res.status(200).json({
      message: 'Password reset email sent successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const registerUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw createHttpError(400, 'Email in use');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
    });

    const session = await createSession(user._id);

    setSessionCookies(res, session);

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      throw createHttpError(401, 'Invalid credentials');
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      throw createHttpError(401, 'Invalid credentials');
    }

    await Session.deleteOne({
      userId: user._id,
    });

    const session = await createSession(user._id);

    setSessionCookies(res, session);

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

export const refreshUserSession = async (req, res, next) => {
  try {
    const { sessionId, refreshToken } = req.cookies;

    const session = await Session.findOne({
      _id: sessionId,
      refreshToken,
    });

    if (!session) {
      throw createHttpError(401, 'Session not found');
    }

    const isSessionExpired =
      new Date() > new Date(session.refreshTokenValidUntil);

    if (isSessionExpired) {
      await Session.deleteOne({
        _id: session._id,
      });

      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      };

      res.clearCookie('sessionId', cookieOptions);
      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);

      throw createHttpError(401, 'Session token expired');
    }

    await Session.deleteOne({
      _id: session._id,
    });

    const newSession = await createSession(session.userId);

    setSessionCookies(res, newSession);

    res.status(200).json({
      message: 'Session refreshed',
    });
  } catch (error) {
    next(error);
  }
};

export const logoutUser = async (req, res, next) => {
  try {
    const { sessionId } = req.cookies;

    if (sessionId) {
      await Session.deleteOne({
        _id: sessionId,
      });
    }

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    };

    res.clearCookie('sessionId', cookieOptions);
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
