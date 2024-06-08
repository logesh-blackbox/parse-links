## Instructions:

- Adjust the `instances` value as required ( `max` to create instances as many as num_cpus in the machine)

- Start the service:

```bash
pm2 start ecosystem.config.cjs
```

or

```bash
pm2 start app.js -i <num-instances>
```
