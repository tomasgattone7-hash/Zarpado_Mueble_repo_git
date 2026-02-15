const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Zarpado Mueble',
    image: 'https://zarpadomueble.com/assets/principal.webp',
    description: 'Diseño y fabricación de muebles a medida. Melamina de 18mm, acabados premium, envíos a todo el país.',
    address: {
        '@type': 'PostalAddress',
        addressCountry: 'AR',
        addressRegion: 'Buenos Aires'
    },
    telephone: '+54-9-11-2747-4780',
    email: 'contacto@zarpadomueble.com',
    url: 'https://zarpadomueble.com',
    priceRange: '$$',
    openingHours: 'Mo-Fr 09:00-18:00',
    sameAs: [
        'https://www.instagram.com/zarpadomuebleoficial/',
        'https://www.facebook.com/profile.php?id=61583196106459'
    ]
};

const script = document.createElement('script');
script.type = 'application/ld+json';
script.text = JSON.stringify(localBusinessSchema);
document.head.appendChild(script);
