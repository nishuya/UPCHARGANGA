const User = require('../src/modules/auth/auth.model');
const { loginSchema, registerSchema } = require('../src/modules/auth/auth.validation');

describe('registration password validation', () => {
  const validRegistration = (password) => ({
    fullName: 'Test Patient',
    email: 'patient@example.com',
    phone: '+12345678901',
    password,
  });

  test.each(['abcdef', '123456', 'ABCDEF', 'aaaaaa', 'abc123', '@abc12'])(
    'accepts password %s',
    (password) => {
      const { error } = registerSchema.validate(validRegistration(password));
      expect(error).toBeUndefined();
    }
  );

  test('preserves passwords without trimming', () => {
    const password = '   abc';
    const { error, value } = registerSchema.validate(validRegistration(password));

    expect(error).toBeUndefined();
    expect(value.password).toBe(password);
  });

  test.each([
    ['short', 'abc12'],
    ['long', 'abcdefghijklm'],
    ['empty', ''],
  ])('rejects %s passwords', (_label, password) => {
    const { error } = registerSchema.validate(validRegistration(password));
    expect(error).toBeDefined();
    expect(error.details.some(({ path }) => path[0] === 'password')).toBe(true);
  });

  test('accepts existing long passwords at login', () => {
    const { error } = loginSchema.validate({
      email: 'patient@example.com',
      password: 'ExistingPassword123!',
    });

    expect(error).toBeUndefined();
  });

  test('allows six-character passwords in the user model', async () => {
    const user = new User({
      fullName: 'Test Patient',
      email: 'patient@example.com',
      password: 'abcdef',
    });

    await expect(user.validate()).resolves.toBeUndefined();
  });
});
