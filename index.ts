import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as mime from "mime";
import * as glob from "glob";
import * as fs from "fs";

const siteDir = 'public';
const siteFiles = glob.sync(`${siteDir}/**/*`);

const config = new pulumi.Config();
export const domain = config.require("domain");
export const url = `http://${domain}`;

// Create an S3 bucket for the website.
const siteBucket = new aws.s3.Bucket("website", {
    bucket: domain,
    website: {
        indexDocument: "index.html",
        errorDocument: "404.html"
    }
});

// Add all website files to the bucket.
siteFiles.forEach((path: string) => {
    if (!fs.lstatSync(path).isDirectory()) {
      const bucketObject = new aws.s3.BucketObject(path.replace(siteDir, ""), {
        bucket: siteBucket,
        source: new pulumi.asset.FileAsset(path),
        contentType: mime.getType(path) || undefined
      });
    }
});

// Create a bucket policy that allows public read access for all objects in the bucket.
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

// Apply the policy to the bucket.
const bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
    bucket: siteBucket.bucket,
    policy: siteBucket.bucket.apply(publicReadPolicyForBucket),
});

// Create a Route53 alias record for the bucket.
async function createAliasRecord(bucket: aws.s3.Bucket, targetDomain: string): Promise<aws.route53.Record> {
    const [alias, ...parent] = targetDomain.split(".");

    // Query AWS for the parent domain's hosted zone ID in order to associate
    // it with the new alias record.
    const parentZone = await aws.route53.getZone({ name: `${parent.join(".")}.` });

    return new aws.route53.Record(
        targetDomain,
        {
            name: alias,
            zoneId: parentZone.zoneId,
            type: "A",
            aliases: [
                {
                    name: bucket.websiteDomain,
                    zoneId: bucket.hostedZoneId,
                    evaluateTargetHealth: true,
                },
            ],
        }
    );
}

createAliasRecord(siteBucket, domain);

// Export the website's public hostname.
export const host = siteBucket.websiteEndpoint;
