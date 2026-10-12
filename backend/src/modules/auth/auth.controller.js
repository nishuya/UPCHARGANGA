const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const authService = require('./auth.service');
const {
  refreshTokenCookieOptions,
  clearRefreshTokenCookieOptions,
} = require('../../utils/cookie.util');

const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body);

  res
    .status(201)
    .cookie('refreshToken', result.refreshToken, refreshTokenCookieOptions)
    .json(new ApiResponse(201, { user: result.user, accessToken: result.accessToken }, 'Registered successfully. You are now logged in.'));
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.loginUser(req.body);

  res
    .status(200)
    .cookie('refreshToken', refreshToken, refreshTokenCookieOptions)
    .json(new ApiResponse(200, { user, accessToken }, 'Logged in successfully.'));
});

const refreshToken = asyncHandler(async (req, res) => {
  const incoming = req.cookies?.refreshToken;

  const { user, accessToken, refreshToken: newRefreshToken } =
    await authService.refreshAccessToken(incoming);

  res
    .status(200)
    .cookie('refreshToken', newRefreshToken, refreshTokenCookieOptions)
    .json(new ApiResponse(200, { user, accessToken }, 'Token refreshed.'));
});

const logout = asyncHandler(async (req, res) => {
  await authService.logoutUser(req.user._id);

  res
    .status(200)
    .clearCookie('refreshToken', clearRefreshTokenCookieOptions)
    .json(new ApiResponse(200, null, 'Logged out successfully.'));
});

const getMe = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, { user: req.user }, 'Current user fetched.'));
});

const updateProfile = asyncHandler(async (req, res) => {
  const { user: result } = await authService.updatePatientProfile(req.user._id, req.body);

  res
    .status(200)
    .json(new ApiResponse(200, { user: result }, 'Profile updated successfully.'));
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateProfile,
};
