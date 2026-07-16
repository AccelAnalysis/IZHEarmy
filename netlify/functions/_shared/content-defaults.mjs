const timestamp = '2026-07-14T00:00:00.000Z';

function record(key, fields) {
  return { key, label: key, status: 'published', fields, publishAt: '', unpublishAt: '', revision: 1, createdAt: timestamp, updatedAt: timestamp };
}

export const DEFAULT_CONTENT_LIBRARY = {
  schemaVersion: 1,
  revision: 1,
  updatedAt: timestamp,
  records: [
    record('site-seo', {
      title: 'IZHE | Who Is God to You?',
      description: 'IZHE is a book-led, church-centered apparel and discipleship movement built around one question: Who is God to you?',
      socialTitle: 'IZHE | Who Is God to You?',
      socialDescription: 'Discover God through His names. Wear the question. Give one away.',
      socialImage: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=85&w=1600&auto=format&fit=crop'
    }),
    record('home-hero', {
      eyebrow: 'A QUESTION WORTH WEARING',
      question: 'Who is God to you?',
      body: 'Discover God through His names. Wear the question. Open the conversation. Give the message to someone else.',
      primaryLabel: 'SHOP COLLECTION 1',
      primaryTarget: '#collection',
      secondaryLabel: 'DISCOVER THE STORY',
      secondaryTarget: '#story',
      backgroundImage: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?q=85&w=2200&auto=format&fit=crop'
    }),
    record('home-story', {
      eyebrow: 'THE FOUNDATION',
      heading: 'More than a logo.',
      accent: 'An invitation.',
      paragraph1: 'IZHE is read and heard as “Is He?” When someone asks what it means, the door opens to a more important question: Who is God to you?',
      paragraph2: 'The book introduces His names. The apparel carries the question. The conversation makes it personal.',
      image: 'https://images.unsplash.com/photo-1529139574466-a303027c028b?q=85&w=1200&auto=format&fit=crop',
      imageAlt: 'A person wearing a simple statement shirt in an urban setting',
      imageEyebrow: 'SOUND IT OUT',
      imageStatement: '“IS HE?”',
      card1Title: 'A visible witness',
      card1Body: 'The design creates curiosity and opens a natural conversation.',
      card2Title: 'Biblical depth',
      card2Body: 'Every collection begins with Scripture and the character of God.'
    }),
    record('home-book', {
      eyebrow: 'BOOK ONE · COLLECTION 1',
      heading: 'Who Is God to You?',
      subtitle: 'Discovering God Through His Names',
      body: 'The book is the foundation of IZHE. It helps readers encounter who God reveals Himself to be before carrying that message into everyday conversations.',
      previewLabel: 'READ THE BOOK PREVIEW',
      libraryLabel: 'EXPLORE THE TEACHING LIBRARY',
      backgroundImage: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=85&w=2000&auto=format&fit=crop',
      readTitle: 'Read', readBody: 'Scripture-led chapters', reflectTitle: 'Reflect', reflectBody: 'Personal application', shareTitle: 'Share', shareBody: 'Conversation prompts'
    }),
    record('home-give-one', {
      eyebrow: 'BUY ONE / GIVE ONE',
      heading: 'One for you. One for someone else.',
      body: 'After checkout, you receive a unique claim code and printable QR card for every shirt purchased.',
      step1Title: 'Purchase', step1Body: 'Choose the shirt and message you will wear.',
      step2Title: 'Share', step2Body: 'Print the QR card or send the secure claim link.',
      step3Title: 'Redeem', step3Body: 'The recipient selects a size and enters the shipping address.',
      image: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?q=85&w=1200&auto=format&fit=crop',
      imageAlt: 'People gathering in community',
      purposeEyebrow: 'THE PURPOSE',
      purposeHeading: 'The gift opens the door.',
      purposeBody: 'The shirt is an invitation to relationship, testimony, and conversation.'
    }),
    record('home-church', {
      eyebrow: 'FOR CHURCHES & MINISTRIES',
      heading: 'Bring the Names of God into the room—and into the community.',
      body: 'Our team is available to come share the IZHE message and help launch a campaign that supports your ministry objectives.',
      secondParagraph: 'Campaign proceeds can be configured to support an approved local mission, outreach, or ministry objective.',
      backgroundImage: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=85&w=2200&auto=format&fit=crop',
      pillar1: 'MESSAGE', pillar2: 'BOOK', pillar3: 'APPAREL', pillar4: 'GIVE ONE',
      formTitle: 'Bring IZHE to Your Church',
      formIntro: 'Send the details below. The IZHE team will respond with campaign options and available dates.',
      submitLabel: 'REQUEST CAMPAIGN INFORMATION'
    }),
    record('site-layout', {
      heroVisible: true, heroAlignment: 'left', heroHeight: 'tall', heroOverlay: 'strong', heroFocalPoint: 'center',
      storyVisible: true, storyOrder: 1, storyAlignment: 'left', storyImagePosition: 'left', storySpacing: 'standard',
      bookVisible: true, bookOrder: 2, bookAlignment: 'left', bookOverlay: 'strong', bookSpacing: 'standard',
      collectionVisible: true, collectionOrder: 3, collectionSpacing: 'standard',
      giveOneVisible: true, giveOneOrder: 4, giveOneAlignment: 'left', giveOneImagePosition: 'right', giveOneSpacing: 'standard',
      churchVisible: true, churchOrder: 5, churchAlignment: 'left', churchOverlay: 'strong', churchSpacing: 'standard'
    }),
    record('site-announcement', { message: '', linkLabel: '', linkUrl: '' })
  ]
};
