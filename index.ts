import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as mime from "mime";
import * as glob from "glob";
import * as fs from "fs";

const siteDir = 'public';
const siteFiles = glob.sync(`${siteDir}/**/*`);

// Create an S3 bucket for the website.
const siteBucket = new aws.s3.Bucket("website", {
    website: {
        indexDocument: "index.html",
        errorDocument: "404.html"
    }
});

// Upload all website files
siteFiles.forEach((path: string) => {
    if (!fs.lstatSync(path).isDirectory()) {
      const bucketObject = new aws.s3.BucketObject(path.replace(siteDir, ""), {
        bucket: siteBucket,
        source: new pulumi.asset.FileAsset(path),
        contentType: mime.getType(path) || undefined
      });
    }
});

// Create an S3 Bucket Policy to allow public read of all objects in bucket.
const publicReadPolicyForBucket = (name: string) => {
    return JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: "*",
            Action: [
                "s3:GetObject"
            ],
            Resource: [
                `arn:aws:s3:::${name}/*`
            ],
        }],
    });
};

const bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
    bucket: siteBucket.bucket,
    policy: siteBucket.bucket.apply(publicReadPolicyForBucket),
});

// Export the DNS name of the bucket.
exports.websiteUrl = siteBucket.websiteEndpoint;
