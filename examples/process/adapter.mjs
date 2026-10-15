const [action, ...values] = process.argv.slice(2);
if (action === 'echo') process.stdout.write(JSON.stringify({ received: values[0], ready: true }));
else if (action === 'info') process.stdout.write(JSON.stringify({ name: 'Local SDK bridge', ready: true }));
else process.exitCode = 2;
