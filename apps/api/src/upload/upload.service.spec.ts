import { UploadService } from './upload.service';

// Mock S3Client to avoid actual instantiation issues
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

describe('UploadService Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.resetModules();
    // Reset env to original state before each test, then override in test
    process.env = { ...originalEnv };
  });

  it('should disable S3 when credentials are placeholders', () => {
    process.env.AWS_ACCESS_KEY_ID = 'your_access_key_id_here';
    process.env.AWS_SECRET_ACCESS_KEY = 'your_secret_access_key_here';
    process.env.AWS_S3_BUCKET_NAME = 'your_bucket_name_here';

    // Directly instantiate since we are testing the constructor logic
    const service = new UploadService();
    expect(service.isS3Enabled()).toBe(false);
  });

  it('should disable S3 when credentials are missing', () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_S3_BUCKET_NAME;

    const service = new UploadService();
    expect(service.isS3Enabled()).toBe(false);
  });

  it('should enable S3 when credentials are valid', () => {
    process.env.AWS_ACCESS_KEY_ID = 'valid_key';
    process.env.AWS_SECRET_ACCESS_KEY = 'valid_secret';
    process.env.AWS_S3_BUCKET_NAME = 'valid_bucket';

    const service = new UploadService();
    expect(service.isS3Enabled()).toBe(true);
  });
});
