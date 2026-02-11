const CLIENT_ID = 'lZeFLXH3VH5hcz2jVGhRmnWLTRk4Usmm';
const CLIENT_SECRET = 'wLAzOJM9SJfQI4a0m6n9jVjIxz6f';

async function run() {
  // Step 1: Get OAuth token
  console.log('Getting OAuth token...');
  const tokenRes = await fetch('https://api.digikey.com/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!tokenRes.ok) {
    console.error('Token error:', tokenRes.status, await tokenRes.text());
    return;
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  console.log('Token obtained. Expires in:', tokenData.expires_in, 's');

  // Step 2: Search for a known MLCC
  console.log('\nSearching for GRM188R71E105KA12...');
  const searchRes = await fetch('https://api.digikey.com/products/v4/search/keyword', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-DIGIKEY-Client-Id': CLIENT_ID,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      Keywords: 'GRM188R71E105KA12',
      Limit: 3,
      Offset: 0,
    }),
  });

  if (!searchRes.ok) {
    console.error('Search error:', searchRes.status, await searchRes.text());
    return;
  }

  const searchData = await searchRes.json();
  console.log('Products found:', searchData.ProductsCount);

  if (searchData.Products && searchData.Products.length > 0) {
    const product = searchData.Products[0];
    console.log('\nFirst product:');
    console.log('  MPN:', product.ManufacturerProductNumber);
    console.log('  Manufacturer:', JSON.stringify(product.Manufacturer));
    console.log('  Description:', JSON.stringify(product.Description));
    console.log('  Category:', JSON.stringify(product.Category));
    console.log('  ProductStatus:', JSON.stringify(product.ProductStatus));
    console.log('  DigiKeyPartNumber:', product.DigiKeyPartNumber);

    console.log(`\n  Parameters (${product.Parameters?.length || 0}):`);
    if (product.Parameters) {
      product.Parameters.forEach(p => {
        console.log(`    ID: ${p.ParameterId} | ${p.ParameterText} = ${p.ValueText}`);
      });
    }

    console.log('\n  All product keys:', Object.keys(product).join(', '));
  }

  if (searchData.ExactMatches && searchData.ExactMatches.length > 0) {
    console.log('\nExact matches:', searchData.ExactMatches.length);
  }

  // Step 3: Get product details for full parametric data
  console.log('\n\n--- Getting product details ---');
  const detailRes = await fetch(
    `https://api.digikey.com/products/v4/search/GRM188R71E105KA12/productdetails`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-DIGIKEY-Client-Id': CLIENT_ID,
        'Accept': 'application/json',
      },
    }
  );

  if (!detailRes.ok) {
    console.error('Detail error:', detailRes.status, await detailRes.text());
    return;
  }

  const detailData = await detailRes.json();
  const dp = detailData.Product;
  console.log('Detail MPN:', dp.ManufacturerProductNumber);
  console.log(`Detail Parameters (${dp.Parameters?.length || 0}):`);
  if (dp.Parameters) {
    dp.Parameters.forEach(p => {
      console.log(`  ID: ${p.ParameterId} | ${p.ParameterText} = ${p.ValueText}`);
    });
  }
  console.log('\nDetail product keys:', Object.keys(dp).join(', '));
}

run().catch(e => console.error('Error:', e));
